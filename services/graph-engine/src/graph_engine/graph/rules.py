"""The compatibility rules engine.

Deliberately pure: takes resolved components plus the graph's known-compatible
edges, returns an assessment. No driver, no network, no clock — so every rule is
unit-testable without standing up Neo4j, and a quote can be reproduced later
from the same inputs and ``RULESET_VERSION``.

Two principles worth stating, because they are what makes this trustworthy for a
$7k purchase:

**Absence of evidence is not compatibility.** A pair the graph has no edge for
is reported in ``unverified_pairs`` and drags ``compatibility_confidence`` down.
It is never silently treated as fine.

**Flight time is a range.** ``confidence_minutes`` is not decoration. A hover
power estimate that ignores wind, temperature, and battery age is worth roughly
±20%, and saying "31 minutes" flat is a promise the aircraft will not keep.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from graph_engine.contracts import (
    AssessmentStatus,
    AutonomyCapability,
    CatalogComponent,
    CompatibilityFinding,
    ComponentKind,
    EngineeringAssessment,
    MassBudget,
    PowerBudget,
    RuleSeverity,
)

#: Bump on any change to the maths or thresholds below. Stamped on every
#: assessment so a historical quote can be explained rather than guessed at.
RULESET_VERSION = "2026.08.1"

#: Above this fraction of max takeoff mass, handling and margin degrade sharply.
MASS_WARNING_UTILIZATION = 0.85
#: Practical usable fraction of nameplate battery capacity (reserve + sag).
USABLE_BATTERY_FRACTION = 0.80
#: Flight-time uncertainty. Wind, temperature and cell age dominate; ±20% is honest.
FLIGHT_TIME_UNCERTAINTY = 0.20


@dataclass(frozen=True)
class GraphEdges:
    """What the graph knows, passed in so the rules stay pure."""

    #: Unordered handle pairs with an explicit COMPATIBLE_WITH edge.
    compatible: frozenset[frozenset[str]] = field(default_factory=frozenset)
    #: Unordered handle pairs with an explicit INCOMPATIBLE_WITH edge.
    incompatible: frozenset[frozenset[str]] = field(default_factory=frozenset)
    #: handle -> reason, for edges that carry an explanation.
    reasons: dict[frozenset[str], str] = field(default_factory=dict)


def _pair(a: str, b: str) -> frozenset[str]:
    return frozenset((a, b))


def _by_kind(
    components: list[CatalogComponent], kind: ComponentKind
) -> list[CatalogComponent]:
    return [c for c in components if c.kind is kind]


def compute_mass_budget(components: list[CatalogComponent]) -> MassBudget:
    platforms = _by_kind(components, ComponentKind.PLATFORM)
    batteries = _by_kind(components, ComponentKind.BATTERY)

    platform = platforms[0] if platforms else None
    platform_dry_g = platform.spec.mass_g if platform else 0.0
    max_takeoff_g = (platform.spec.max_takeoff_mass_g or 0.0) if platform else 0.0
    battery_g = sum(b.spec.mass_g for b in batteries)
    payload_g = sum(
        c.spec.mass_g
        for c in components
        if c.kind not in (ComponentKind.PLATFORM, ComponentKind.BATTERY, ComponentKind.SOFTWARE)
    )

    total_g = platform_dry_g + battery_g + payload_g
    utilization = (total_g / max_takeoff_g) if max_takeoff_g > 0 else 0.0

    return MassBudget(
        platform_dry_g=platform_dry_g,
        payload_g=payload_g,
        battery_g=battery_g,
        total_g=total_g,
        max_takeoff_g=max_takeoff_g,
        utilization=round(utilization, 4),
        headroom_g=round(max_takeoff_g - total_g, 2),
    )


def compute_power_budget(components: list[CatalogComponent], mass: MassBudget) -> PowerBudget:
    platforms = _by_kind(components, ComponentKind.PLATFORM)
    batteries = _by_kind(components, ComponentKind.BATTERY)

    base_hover_w = (platforms[0].spec.hover_power_w or 0.0) if platforms else 0.0

    # Hover power scales roughly with mass^1.5 for a rotor at fixed disc area.
    # The vendor figure is quoted at some reference mass; if we are heavier than
    # the airframe dry weight, hovering costs more. Crude, but directionally
    # right and far better than pretending payload is free.
    reference_g = mass.platform_dry_g or mass.total_g or 1.0
    scale = (mass.total_g / reference_g) ** 1.5 if reference_g > 0 else 1.0
    hover_w = base_hover_w * scale

    avionics_w = sum(
        c.spec.typical_power_w
        for c in components
        if c.kind in (ComponentKind.COMPUTE, ComponentKind.FLIGHT_CONTROLLER, ComponentKind.RADIO)
    )
    payload_w = sum(
        c.spec.typical_power_w
        for c in components
        if c.kind in (ComponentKind.SENSOR, ComponentKind.GIMBAL)
    )

    total_w = hover_w + avionics_w + payload_w
    capacity_wh = sum(b.spec.capacity_wh or 0.0 for b in batteries)
    usable_wh = capacity_wh * USABLE_BATTERY_FRACTION

    minutes = (usable_wh / total_w * 60.0) if total_w > 0 and usable_wh > 0 else 0.0

    return PowerBudget(
        hover_w=round(hover_w, 2),
        avionics_w=round(avionics_w, 2),
        payload_w=round(payload_w, 2),
        total_w=round(total_w, 2),
        estimated_flight_minutes=round(minutes, 1),
        model="linear_wh_over_w",
        confidence_minutes=round(minutes * FLIGHT_TIME_UNCERTAINTY, 1),
    )


def _structural_findings(components: list[CatalogComponent]) -> list[CompatibilityFinding]:
    """Rules that follow from the parts list alone, independent of graph edges."""
    findings: list[CompatibilityFinding] = []
    handles = [c.handle for c in components]

    platforms = _by_kind(components, ComponentKind.PLATFORM)
    if not platforms:
        findings.append(
            CompatibilityFinding(
                rule_id="STRUCT.no_platform",
                severity=RuleSeverity.BLOCKER,
                subjects=handles,
                message="No airframe selected — a configuration needs exactly one platform.",
            )
        )
    elif len(platforms) > 1:
        findings.append(
            CompatibilityFinding(
                rule_id="STRUCT.multiple_platforms",
                severity=RuleSeverity.BLOCKER,
                subjects=[p.handle for p in platforms],
                message=(
                    f"{len(platforms)} airframes selected "
                    f"({', '.join(p.title for p in platforms)}); choose one."
                ),
            )
        )

    if not _by_kind(components, ComponentKind.BATTERY):
        findings.append(
            CompatibilityFinding(
                rule_id="STRUCT.no_battery",
                severity=RuleSeverity.WARNING,
                subjects=handles,
                message="No battery selected — flight time cannot be estimated.",
            )
        )

    # Camera-interface sensors need somewhere to plug in.
    computes = _by_kind(components, ComponentKind.COMPUTE)
    camera_sensors = [
        c
        for c in components
        if c.kind is ComponentKind.SENSOR and (c.spec.interface in ("csi", "gmsl2"))
    ]
    if camera_sensors:
        ports = sum(c.spec.camera_ports or 0 for c in computes)
        if ports < len(camera_sensors):
            findings.append(
                CompatibilityFinding(
                    rule_id="IFACE.camera_ports_exceeded",
                    severity=RuleSeverity.BLOCKER,
                    subjects=[c.handle for c in camera_sensors] + [c.handle for c in computes],
                    message=(
                        f"{len(camera_sensors)} camera-interface sensors selected but the compute "
                        f"module provides {ports} camera port(s)."
                    ),
                    remedies=[c.handle for c in computes],
                )
            )

    # GPS-denied flight needs a compute module that actually supports VIO.
    wants_vio = any(
        AutonomyCapability.VIO in c.spec.supported_autonomy for c in components
    )
    if computes and not wants_vio:
        findings.append(
            CompatibilityFinding(
                rule_id="AUTONOMY.no_vio",
                severity=RuleSeverity.INFO,
                subjects=[c.handle for c in computes],
                message="No selected component advertises VIO; GPS-denied flight is not supported.",
            )
        )

    return findings


def _budget_findings(mass: MassBudget, power: PowerBudget) -> list[CompatibilityFinding]:
    findings: list[CompatibilityFinding] = []

    if mass.max_takeoff_g > 0 and mass.total_g > mass.max_takeoff_g:
        findings.append(
            CompatibilityFinding(
                rule_id="MASS.over_mtow",
                severity=RuleSeverity.BLOCKER,
                subjects=[],
                message=(
                    f"Total mass {mass.total_g:.0f} g exceeds the airframe's maximum takeoff mass "
                    f"of {mass.max_takeoff_g:.0f} g by {mass.total_g - mass.max_takeoff_g:.0f} g."
                ),
            )
        )
    elif mass.utilization >= MASS_WARNING_UTILIZATION:
        findings.append(
            CompatibilityFinding(
                rule_id="MASS.low_headroom",
                severity=RuleSeverity.WARNING,
                subjects=[],
                message=(
                    f"Using {mass.utilization * 100:.0f}% of maximum takeoff mass; "
                    f"only {mass.headroom_g:.0f} g of headroom remains."
                ),
            )
        )

    if power.estimated_flight_minutes and power.estimated_flight_minutes < 10:
        findings.append(
            CompatibilityFinding(
                rule_id="POWER.short_endurance",
                severity=RuleSeverity.WARNING,
                subjects=[],
                message=(
                    f"Estimated endurance is only "
                    f"{power.estimated_flight_minutes:.0f} ± {power.confidence_minutes:.0f} minutes."
                ),
            )
        )

    return findings


def _graph_findings(
    components: list[CatalogComponent], edges: GraphEdges
) -> tuple[list[CompatibilityFinding], list[tuple[str, str]]]:
    """Explicit incompatibilities, plus the pairs the graph simply has no opinion on."""
    findings: list[CompatibilityFinding] = []
    unverified: list[tuple[str, str]] = []
    handles = sorted(c.handle for c in components)

    for i, a in enumerate(handles):
        for b in handles[i + 1 :]:
            pair = _pair(a, b)
            if pair in edges.incompatible:
                findings.append(
                    CompatibilityFinding(
                        rule_id="GRAPH.incompatible",
                        severity=RuleSeverity.BLOCKER,
                        subjects=[a, b],
                        message=edges.reasons.get(pair, f"{a} and {b} are marked incompatible."),
                    )
                )
            elif pair not in edges.compatible:
                unverified.append((a, b))

    return findings, unverified


def assess(
    components: list[CatalogComponent],
    edges: GraphEdges,
    *,
    computed_at: str,
) -> EngineeringAssessment:
    """Full assessment. ``computed_at`` is injected so this stays deterministic."""
    mass = compute_mass_budget(components)
    power = compute_power_budget(components, mass)

    graph_findings, unverified = _graph_findings(components, edges)
    findings = [
        *_structural_findings(components),
        *_budget_findings(mass, power),
        *graph_findings,
    ]

    total_pairs = len(components) * (len(components) - 1) // 2
    verified_pairs = total_pairs - len(unverified)
    confidence = (verified_pairs / total_pairs) if total_pairs else 1.0

    has_blocker = any(f.severity is RuleSeverity.BLOCKER for f in findings)
    has_warning = any(f.severity is RuleSeverity.WARNING for f in findings)

    if has_blocker:
        status = AssessmentStatus.INCOMPATIBLE
    elif not components or not _by_kind(components, ComponentKind.PLATFORM):
        status = AssessmentStatus.INCOMPLETE
    elif has_warning or unverified:
        status = AssessmentStatus.COMPATIBLE_WITH_WARNINGS
    else:
        status = AssessmentStatus.COMPATIBLE

    return EngineeringAssessment(
        status=status,
        findings=findings,
        mass=mass,
        power=power,
        compatibility_confidence=round(confidence, 4),
        unverified_pairs=unverified,
        computed_at=computed_at,
        ruleset_version=RULESET_VERSION,
    )
