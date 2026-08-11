"""Ontology tests. Pure functions, no Neo4j."""

from __future__ import annotations

import pytest

from graph_engine.ontology.inference import (
    ComponentFacts,
    Evidence,
    confidence_from_verdicts,
    mission_fit,
    pair_verdict,
    port_budgets,
)
from graph_engine.ontology.schema import (
    CAPABILITIES,
    INTERFACES,
    MISSION_REQUIREMENTS,
    NodeLabel,
    OntologyViolation,
    RelType,
    expand_mission,
    validate_triple,
)


def facts(handle: str, kind: str, provides=None, consumes=None, caps=()) -> ComponentFacts:
    return ComponentFacts(
        handle=handle,
        kind=kind,
        provides_interfaces=provides or {},
        consumes_interfaces=consumes or {},
        provides_capabilities=frozenset(caps),
    )


# ── Vocabulary hygiene ────────────────────────────────────────────────────────


def test_mission_requirements_reference_known_capabilities() -> None:
    """A typo in the requirements table silently makes a mission unsatisfiable."""
    for mission, required in MISSION_REQUIREMENTS.items():
        unknown = required - CAPABILITIES
        assert not unknown, f"{mission} requires undefined capabilities: {sorted(unknown)}"


def test_capability_closure_terminates() -> None:
    for mission in MISSION_REQUIREMENTS:
        assert expand_mission(mission), f"{mission} expands to nothing"


def test_closure_pulls_in_implied_capabilities() -> None:
    # The customer says "solar inspection"; nobody says "and GNSS positioning".
    expanded = expand_mission("solar_inspection")
    assert "rtk_positioning" in expanded
    assert "gnss_positioning" in expanded, "RTK without GNSS is not a real requirement set"


def test_gps_denied_implies_vio() -> None:
    assert "vio" in expand_mission("indoor_gps_denied")


def test_unknown_mission_expands_to_empty_not_error() -> None:
    assert expand_mission("underwater_basket_weaving") == frozenset()


# ── Domain/range enforcement ──────────────────────────────────────────────────


def test_valid_triple_passes() -> None:
    validate_triple(NodeLabel.COMPONENT, RelType.PROVIDES, NodeLabel.CAPABILITY)


def test_range_violation_is_rejected() -> None:
    with pytest.raises(OntologyViolation, match="range"):
        validate_triple(NodeLabel.COMPONENT, RelType.PROVIDES, NodeLabel.MISSION)


def test_domain_violation_is_rejected() -> None:
    with pytest.raises(OntologyViolation, match="domain"):
        validate_triple(NodeLabel.MISSION, RelType.CONSUMES, NodeLabel.INTERFACE)


def test_curated_compatibility_requires_evidence() -> None:
    with pytest.raises(OntologyViolation, match="unevidenced"):
        validate_triple(
            NodeLabel.COMPONENT, RelType.COMPATIBLE_WITH, NodeLabel.COMPONENT, props={}
        )
    validate_triple(
        NodeLabel.COMPONENT,
        RelType.COMPATIBLE_WITH,
        NodeLabel.COMPONENT,
        props={"verified_at": "2026-08-11", "verified_by": "bench"},
    )


# ── Inference grading ─────────────────────────────────────────────────────────


def test_matching_interfaces_infer_compatibility() -> None:
    compute = facts("voxl2", "compute", provides={"csi": 4})
    sensor = facts("flir-boson", "sensor", consumes={"csi": 1})
    v = pair_verdict(compute, sensor)
    assert v.evidence is Evidence.INFERRED
    assert v.via == ("csi",)
    assert "not individually bench-tested" in v.reason


def test_curated_verification_beats_inference() -> None:
    compute = facts("voxl2", "compute", provides={"csi": 4})
    sensor = facts("flir-boson", "sensor", consumes={"csi": 1})
    v = pair_verdict(compute, sensor, curated_verified=True)
    assert v.evidence is Evidence.VERIFIED


def test_refutation_beats_everything() -> None:
    compute = facts("voxl2", "compute", provides={"csi": 4})
    sensor = facts("flir-boson", "sensor", consumes={"csi": 1})
    v = pair_verdict(compute, sensor, curated_refuted=True, curated_reason="Firmware conflict.")
    assert v.evidence is Evidence.REFUTED
    assert v.reason == "Firmware conflict."


def test_no_shared_interface_is_unknown_not_compatible() -> None:
    a = facts("compute-a", "compute", provides={"usb3": 2})
    b = facts("sensor-b", "sensor", consumes={"gmsl2": 1})
    assert pair_verdict(a, b).evidence is Evidence.UNKNOWN


def test_two_passive_parts_do_not_count_as_unknown() -> None:
    # Two sensors never attach to each other; calling that "unknown" would
    # unfairly drag confidence down on every multi-sensor build.
    a = facts("sensor-a", "sensor", provides={"csi": 0})
    b = facts("sensor-b", "sensor")
    assert pair_verdict(a, b).evidence is Evidence.INFERRED


# ── Port budgets ──────────────────────────────────────────────────────────────


def test_port_budget_catches_what_pairwise_checks_miss() -> None:
    compute = facts("voxl2", "compute", provides={"csi": 3})
    cams = [facts(f"cam-{i}", "sensor", consumes={"csi": 1}) for i in range(4)]

    # Every pair individually looks fine...
    assert all(pair_verdict(compute, c).evidence is Evidence.INFERRED for c in cams)

    # ...but four cameras do not fit in three ports.
    budget = next(b for b in port_budgets([compute, *cams]) if b.interface == "csi")
    assert budget.provided == 3
    assert budget.consumed == 4
    assert not budget.satisfied


def test_port_budget_satisfied_when_supply_suffices() -> None:
    compute = facts("voxl2", "compute", provides={"csi": 4})
    cams = [facts(f"cam-{i}", "sensor", consumes={"csi": 1}) for i in range(2)]
    assert all(b.satisfied for b in port_budgets([compute, *cams]))


# ── Mission fit ───────────────────────────────────────────────────────────────


def test_mission_fit_reports_what_is_missing() -> None:
    thermal = facts(
        "flir-boson", "sensor", caps=("thermal_imaging", "radiometric_measurement")
    )
    fit = mission_fit("thermal_inspection", [thermal])
    assert not fit.complete
    assert "waypoint_navigation" in fit.missing
    assert 0 < fit.coverage < 1


def test_mission_fit_complete_when_all_capabilities_present() -> None:
    parts = [
        facts("a", "sensor", caps=("thermal_imaging", "radiometric_measurement")),
        facts("b", "compute", caps=("waypoint_navigation",)),
    ]
    fit = mission_fit("thermal_inspection", parts)
    assert fit.complete
    assert fit.coverage == 1.0


# ── Confidence ────────────────────────────────────────────────────────────────


def test_inferred_build_does_not_read_as_fully_verified() -> None:
    compute = facts("voxl2", "compute", provides={"csi": 4})
    sensor = facts("cam", "sensor", consumes={"csi": 1})
    inferred = [pair_verdict(compute, sensor)]
    verified = [pair_verdict(compute, sensor, curated_verified=True)]

    assert confidence_from_verdicts(inferred) == 0.6
    assert confidence_from_verdicts(verified) == 1.0
    assert confidence_from_verdicts(inferred) < confidence_from_verdicts(verified)


def test_unknown_pairs_score_zero() -> None:
    a = facts("a", "compute", provides={"usb3": 1})
    b = facts("b", "sensor", consumes={"gmsl2": 1})
    assert confidence_from_verdicts([pair_verdict(a, b)]) == 0.0


def test_interfaces_vocabulary_is_closed() -> None:
    # Guards against "usb3" vs "USB3" vs "usb-3" creeping in via seed data.
    assert all(i == i.lower() for i in INTERFACES)
    assert all(" " not in i for i in INTERFACES)
