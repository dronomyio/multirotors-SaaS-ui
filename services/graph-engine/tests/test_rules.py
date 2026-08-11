"""Rules-engine tests. No Neo4j, no Temporal — the whole point of keeping it pure."""

from __future__ import annotations

from graph_engine.contracts import AssessmentStatus, ComponentKind, RuleSeverity
from graph_engine.graph.rules import GraphEdges, assess, compute_mass_budget, compute_power_budget

from .conftest import component


def all_compatible(*handles: str) -> GraphEdges:
    pairs = {
        frozenset((a, b)) for i, a in enumerate(handles) for b in handles[i + 1 :]
    }
    return GraphEdges(compatible=frozenset(pairs))


# ── Mass ──────────────────────────────────────────────────────────────────────


def test_mass_budget_sums_by_role(platform, compute, battery, thermal) -> None:
    mass = compute_mass_budget([platform, compute, battery, thermal])
    assert mass.platform_dry_g == 2200.0
    assert mass.battery_g == 1800.0
    assert mass.payload_g == 16.0 + 95.0  # compute + sensor; battery/platform excluded
    assert mass.total_g == 2200.0 + 1800.0 + 111.0
    assert mass.headroom_g == 6000.0 - 4111.0


def test_over_mtow_is_a_blocker(platform, battery) -> None:
    anvil = component("lead-brick", ComponentKind.SENSOR, mass_g=5000.0)
    result = assess(
        [platform, battery, anvil],
        all_compatible("mr-x10", "tattu-16000", "lead-brick"),
        computed_at="2026-08-11T00:00:00Z",
    )
    assert result.status is AssessmentStatus.INCOMPATIBLE
    assert any(f.rule_id == "MASS.over_mtow" for f in result.findings)


def test_low_headroom_warns_before_it_blocks(platform, battery) -> None:
    # 2200 + 1800 + 1300 = 5300 of 6000 -> 88%
    heavy = component("heavy-pod", ComponentKind.SENSOR, mass_g=1300.0)
    result = assess(
        [platform, battery, heavy],
        all_compatible("mr-x10", "tattu-16000", "heavy-pod"),
        computed_at="2026-08-11T00:00:00Z",
    )
    assert result.status is AssessmentStatus.COMPATIBLE_WITH_WARNINGS
    assert any(f.rule_id == "MASS.low_headroom" for f in result.findings)


# ── Power ─────────────────────────────────────────────────────────────────────


def test_flight_time_ships_as_a_range(platform, compute, battery, thermal) -> None:
    mass = compute_mass_budget([platform, compute, battery, thermal])
    power = compute_power_budget([platform, compute, battery, thermal], mass)

    assert power.estimated_flight_minutes > 0
    assert power.confidence_minutes > 0, "a point estimate with no range is a false promise"
    assert power.model == "linear_wh_over_w"
    assert power.payload_w == 3.0  # sensor only
    assert power.avionics_w == 8.0  # compute only


def test_hover_power_grows_with_payload(platform, battery) -> None:
    light = [platform, battery]
    heavy = [platform, battery, component("pod", ComponentKind.SENSOR, mass_g=1200.0)]

    light_power = compute_power_budget(light, compute_mass_budget(light))
    heavy_power = compute_power_budget(heavy, compute_mass_budget(heavy))

    assert heavy_power.hover_w > light_power.hover_w
    assert heavy_power.estimated_flight_minutes < light_power.estimated_flight_minutes


# ── Structural ────────────────────────────────────────────────────────────────


def test_no_platform_is_incomplete_not_compatible(compute, battery) -> None:
    result = assess(
        [compute, battery],
        all_compatible("voxl2", "tattu-16000"),
        computed_at="2026-08-11T00:00:00Z",
    )
    assert result.status is AssessmentStatus.INCOMPATIBLE
    assert any(f.rule_id == "STRUCT.no_platform" for f in result.findings)


def test_two_airframes_blocks(platform, battery) -> None:
    second = component(
        "mr-x20", ComponentKind.PLATFORM, mass_g=3000.0, max_takeoff_mass_g=9000.0,
        hover_power_w=500.0,
    )
    result = assess(
        [platform, second, battery],
        all_compatible("mr-x10", "mr-x20", "tattu-16000"),
        computed_at="2026-08-11T00:00:00Z",
    )
    assert any(f.rule_id == "STRUCT.multiple_platforms" for f in result.findings)


def test_camera_ports_are_finite(platform, battery) -> None:
    small_compute = component(
        "tiny-compute", ComponentKind.COMPUTE, mass_g=10.0, camera_ports=1,
        supported_autonomy=[],
    )
    cams = [
        component(f"cam-{i}", ComponentKind.SENSOR, mass_g=30.0, interface="csi")
        for i in range(3)
    ]
    result = assess(
        [platform, battery, small_compute, *cams],
        GraphEdges(),
        computed_at="2026-08-11T00:00:00Z",
    )
    finding = next(f for f in result.findings if f.rule_id == "IFACE.camera_ports_exceeded")
    assert finding.severity is RuleSeverity.BLOCKER
    assert "1 camera port" in finding.message


# ── Graph edges and honesty about ignorance ───────────────────────────────────


def test_unverified_pairs_lower_confidence_rather_than_pass_silently(
    platform, compute, battery
) -> None:
    result = assess([platform, compute, battery], GraphEdges(), computed_at="2026-08-11T00:00:00Z")
    assert result.compatibility_confidence == 0.0
    assert len(result.unverified_pairs) == 3
    assert result.status is AssessmentStatus.COMPATIBLE_WITH_WARNINGS


def test_fully_verified_build_is_clean(platform, compute, battery, thermal) -> None:
    edges = all_compatible("mr-x10", "voxl2", "tattu-16000", "flir-boson")
    result = assess([platform, compute, battery, thermal], edges, computed_at="2026-08-11T00:00:00Z")
    assert result.status is AssessmentStatus.COMPATIBLE
    assert result.compatibility_confidence == 1.0
    assert result.unverified_pairs == []


def test_explicit_incompatibility_blocks_and_explains(platform, compute, battery) -> None:
    edges = GraphEdges(
        compatible=frozenset(
            {frozenset(("mr-x10", "tattu-16000")), frozenset(("voxl2", "tattu-16000"))}
        ),
        incompatible=frozenset({frozenset(("mr-x10", "voxl2"))}),
        reasons={frozenset(("mr-x10", "voxl2")): "No mounting provision for VOXL2 on MR-X10."},
    )
    result = assess([platform, compute, battery], edges, computed_at="2026-08-11T00:00:00Z")
    assert result.status is AssessmentStatus.INCOMPATIBLE
    finding = next(f for f in result.findings if f.rule_id == "GRAPH.incompatible")
    assert finding.message == "No mounting provision for VOXL2 on MR-X10."


def test_assessment_is_deterministic(platform, compute, battery, thermal) -> None:
    """Same inputs, same ruleset version, same output — so a quote is reproducible."""
    edges = all_compatible("mr-x10", "voxl2", "tattu-16000", "flir-boson")
    parts = [platform, compute, battery, thermal]
    a = assess(parts, edges, computed_at="2026-08-11T00:00:00Z")
    b = assess(parts, edges, computed_at="2026-08-11T00:00:00Z")
    assert a.model_dump() == b.model_dump()
