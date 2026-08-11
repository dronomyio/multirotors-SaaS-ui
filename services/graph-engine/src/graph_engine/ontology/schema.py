"""The component ontology.

Why an ontology rather than a pile of ``COMPATIBLE_WITH`` edges: hand-authored
compatibility is O(n²) in the catalog and goes stale the moment a product is
added. With 400 SKUs that is 80,000 pairs nobody will ever curate.

Instead, model the *reasons* things are compatible and let compatibility be
derived:

    (:Compute)-[:PROVIDES]->(:Interface {name: "csi", count: 4})
    (:Sensor)-[:CONSUMES]->(:Interface {name: "csi", count: 1})
    ⇒ the sensor can attach, provided ports remain

    (:Mission {name:"thermal_inspection"})-[:REQUIRES]->(:Capability {name:"thermal_imaging"})
    (:Sensor)-[:PROVIDES]->(:Capability {name:"thermal_imaging"})
    ⇒ the sensor is a candidate for that mission

A curated ``COMPATIBLE_WITH`` edge still wins where it exists — bench testing
beats inference. The ontology's job is to give a defensible answer for the
99% of pairs nobody has tested, and to be honest that the answer is inferred.

Every derived claim carries its provenance so the UI can distinguish
"we tested this" from "the interfaces line up".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Final


class NodeLabel(StrEnum):
    """Node types. Anything not listed here does not belong in the graph."""

    COMPONENT = "Component"
    #: Physical or logical connection: csi, gmsl2, usb3, can, uart, ethernet, mount points.
    INTERFACE = "Interface"
    #: What a component can *do*: thermal_imaging, vio, rtk_positioning.
    CAPABILITY = "Capability"
    #: A customer job: thermal_inspection, mapping_survey.
    MISSION = "Mission"
    #: Manufacturer.
    VENDOR = "Vendor"
    #: Regulatory or procurement class: blue_uas, ntia_compliant, ce.
    COMPLIANCE = "Compliance"


class RelType(StrEnum):
    PROVIDES = "PROVIDES"          # Component -> Interface | Capability
    CONSUMES = "CONSUMES"          # Component -> Interface
    REQUIRES = "REQUIRES"          # Mission|Capability -> Capability
    SUITED_FOR = "SUITED_FOR"      # Component -> Mission
    MADE_BY = "MADE_BY"            # Component -> Vendor
    CERTIFIED = "CERTIFIED"        # Component -> Compliance
    COMPATIBLE_WITH = "COMPATIBLE_WITH"      # Component <-> Component (curated)
    INCOMPATIBLE_WITH = "INCOMPATIBLE_WITH"  # Component <-> Component (curated)
    SUPERSEDES = "SUPERSEDES"      # Component -> Component
    ALTERNATIVE_TO = "ALTERNATIVE_TO"        # Component <-> Component


@dataclass(frozen=True)
class RelationSpec:
    """Domain and range constraints, enforced on write.

    An ontology nobody validates is documentation. These are checked in
    ``validate_triple`` before anything is written, so a `(:Sensor)-[:PROVIDES]->
    (:Mission)` is rejected rather than quietly corrupting later inference.
    """

    rel: RelType
    domain: frozenset[NodeLabel]
    range_: frozenset[NodeLabel]
    symmetric: bool = False
    #: Properties the edge must carry.
    required_props: frozenset[str] = field(default_factory=frozenset)


RELATIONS: Final[dict[RelType, RelationSpec]] = {
    RelType.PROVIDES: RelationSpec(
        RelType.PROVIDES,
        frozenset({NodeLabel.COMPONENT}),
        frozenset({NodeLabel.INTERFACE, NodeLabel.CAPABILITY}),
    ),
    RelType.CONSUMES: RelationSpec(
        RelType.CONSUMES,
        frozenset({NodeLabel.COMPONENT}),
        frozenset({NodeLabel.INTERFACE}),
    ),
    RelType.REQUIRES: RelationSpec(
        RelType.REQUIRES,
        frozenset({NodeLabel.MISSION, NodeLabel.CAPABILITY}),
        frozenset({NodeLabel.CAPABILITY}),
    ),
    RelType.SUITED_FOR: RelationSpec(
        RelType.SUITED_FOR,
        frozenset({NodeLabel.COMPONENT}),
        frozenset({NodeLabel.MISSION}),
    ),
    RelType.MADE_BY: RelationSpec(
        RelType.MADE_BY,
        frozenset({NodeLabel.COMPONENT}),
        frozenset({NodeLabel.VENDOR}),
    ),
    RelType.CERTIFIED: RelationSpec(
        RelType.CERTIFIED,
        frozenset({NodeLabel.COMPONENT}),
        frozenset({NodeLabel.COMPLIANCE}),
    ),
    RelType.COMPATIBLE_WITH: RelationSpec(
        RelType.COMPATIBLE_WITH,
        frozenset({NodeLabel.COMPONENT}),
        frozenset({NodeLabel.COMPONENT}),
        symmetric=True,
        # A curated compatibility claim without evidence is just an opinion.
        required_props=frozenset({"verified_at", "verified_by"}),
    ),
    RelType.INCOMPATIBLE_WITH: RelationSpec(
        RelType.INCOMPATIBLE_WITH,
        frozenset({NodeLabel.COMPONENT}),
        frozenset({NodeLabel.COMPONENT}),
        symmetric=True,
        required_props=frozenset({"reason"}),
    ),
    RelType.SUPERSEDES: RelationSpec(
        RelType.SUPERSEDES,
        frozenset({NodeLabel.COMPONENT}),
        frozenset({NodeLabel.COMPONENT}),
    ),
    RelType.ALTERNATIVE_TO: RelationSpec(
        RelType.ALTERNATIVE_TO,
        frozenset({NodeLabel.COMPONENT}),
        frozenset({NodeLabel.COMPONENT}),
        symmetric=True,
    ),
}


class OntologyViolation(ValueError):
    """Raised when a triple would break the ontology's domain/range rules."""


def validate_triple(
    subject_label: NodeLabel,
    rel: RelType,
    object_label: NodeLabel,
    props: dict[str, object] | None = None,
) -> None:
    spec = RELATIONS.get(rel)
    if spec is None:
        raise OntologyViolation(f"unknown relation {rel!r}")
    if subject_label not in spec.domain:
        raise OntologyViolation(
            f"{rel} has domain {sorted(spec.domain)}, got subject {subject_label}"
        )
    if object_label not in spec.range_:
        raise OntologyViolation(
            f"{rel} has range {sorted(spec.range_)}, got object {object_label}"
        )
    missing = spec.required_props - set(props or {})
    if missing:
        raise OntologyViolation(
            f"{rel} requires edge properties {sorted(missing)}; "
            f"an unevidenced claim is not admissible"
        )


# ── Controlled vocabularies ───────────────────────────────────────────────────
#
# Free-text interface names are how you end up with "USB3", "usb-3", and
# "usb_3.0" all failing to match. These are the only legal values.

INTERFACES: Final[frozenset[str]] = frozenset(
    {
        # data
        "csi", "gmsl2", "usb3", "usb2", "ethernet", "uart", "can", "spi", "i2c", "pcie",
        # power
        "power_5v", "power_12v", "power_battery",
        # physical
        "mount_top", "mount_bottom", "mount_gimbal", "mount_rail",
        # radio
        "rf_2g4", "rf_5g8", "rf_900m",
    }
)

CAPABILITIES: Final[frozenset[str]] = frozenset(
    {
        "thermal_imaging", "rgb_imaging", "multispectral_imaging", "depth_sensing",
        "lidar_ranging", "gnss_positioning", "rtk_positioning",
        "vio", "slam", "obstacle_avoidance", "precision_landing",
        "waypoint_navigation", "inspection_autonomy", "gps_denied_flight",
        "onboard_inference", "video_transmission", "radiometric_measurement",
    }
)

MISSIONS: Final[frozenset[str]] = frozenset(
    {
        "solar_inspection", "thermal_inspection", "infrastructure_inspection",
        "mapping_survey", "search_and_rescue", "security_patrol",
        "indoor_gps_denied", "research_development",
    }
)

#: Missions expand to the capabilities they need. This is the ontology's most
#: load-bearing table: it turns "build me a thermal inspection drone" into a
#: concrete, checkable requirement set instead of a vibe.
MISSION_REQUIREMENTS: Final[dict[str, frozenset[str]]] = {
    "thermal_inspection": frozenset(
        {"thermal_imaging", "radiometric_measurement", "waypoint_navigation"}
    ),
    "solar_inspection": frozenset(
        {"thermal_imaging", "radiometric_measurement", "inspection_autonomy", "rtk_positioning"}
    ),
    "infrastructure_inspection": frozenset(
        {"rgb_imaging", "inspection_autonomy", "obstacle_avoidance"}
    ),
    "mapping_survey": frozenset({"rgb_imaging", "rtk_positioning", "waypoint_navigation"}),
    "search_and_rescue": frozenset({"thermal_imaging", "rgb_imaging", "video_transmission"}),
    "security_patrol": frozenset({"rgb_imaging", "waypoint_navigation", "video_transmission"}),
    "indoor_gps_denied": frozenset(
        {"vio", "gps_denied_flight", "obstacle_avoidance", "onboard_inference"}
    ),
    "research_development": frozenset({"onboard_inference", "vio"}),
}

#: Capabilities that imply others. `gps_denied_flight` without `vio` or `slam` is
#: a claim no aircraft can honour, so the closure makes the dependency explicit.
CAPABILITY_REQUIREMENTS: Final[dict[str, frozenset[str]]] = {
    "gps_denied_flight": frozenset({"vio"}),
    "slam": frozenset({"onboard_inference"}),
    "inspection_autonomy": frozenset({"waypoint_navigation", "obstacle_avoidance"}),
    "rtk_positioning": frozenset({"gnss_positioning"}),
    "radiometric_measurement": frozenset({"thermal_imaging"}),
}


def expand_mission(mission: str) -> frozenset[str]:
    """Transitive closure of what a mission actually needs.

    ``solar_inspection`` asks for ``rtk_positioning``, which needs
    ``gnss_positioning``. A customer never says that; the ontology has to.
    """
    seen: set[str] = set()
    queue = list(MISSION_REQUIREMENTS.get(mission, frozenset()))
    while queue:
        capability = queue.pop()
        if capability in seen:
            continue
        seen.add(capability)
        queue.extend(CAPABILITY_REQUIREMENTS.get(capability, frozenset()))
    return frozenset(seen)


# ── Cypher DDL ────────────────────────────────────────────────────────────────

SCHEMA_STATEMENTS: Final[tuple[str, ...]] = (
    "CREATE CONSTRAINT component_handle IF NOT EXISTS "
    "FOR (c:Component) REQUIRE c.handle IS UNIQUE",
    "CREATE CONSTRAINT interface_name IF NOT EXISTS "
    "FOR (i:Interface) REQUIRE i.name IS UNIQUE",
    "CREATE CONSTRAINT capability_name IF NOT EXISTS "
    "FOR (c:Capability) REQUIRE c.name IS UNIQUE",
    "CREATE CONSTRAINT mission_name IF NOT EXISTS "
    "FOR (m:Mission) REQUIRE m.name IS UNIQUE",
    "CREATE CONSTRAINT vendor_name IF NOT EXISTS FOR (v:Vendor) REQUIRE v.name IS UNIQUE",
    "CREATE CONSTRAINT compliance_name IF NOT EXISTS "
    "FOR (c:Compliance) REQUIRE c.name IS UNIQUE",
    "CREATE INDEX component_kind IF NOT EXISTS FOR (c:Component) ON (c.kind)",
    "CREATE INDEX component_variant IF NOT EXISTS FOR (c:Component) ON (c.variant_id)",
    # Free-text fallback for when semantic search is unavailable.
    "CREATE FULLTEXT INDEX component_text IF NOT EXISTS "
    "FOR (c:Component) ON EACH [c.title, c.summary]",
)
