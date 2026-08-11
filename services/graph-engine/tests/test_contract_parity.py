"""The test that makes a two-language contract safe.

TypeScript is the source of truth. ``lib/contracts/scripts/export-wire.ts``
emits the Temporal names and JSON Schemas; this asserts Python agrees.

Without this, the failure mode is silent and expensive: TS starts
``"ConfigurationSession"``, Python registered ``"configuration_session"``, and
the customer just sees a spinner until the client times out. Nothing throws,
nothing type-errors, and the logs on both sides look healthy.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from graph_engine.contracts import (
    CatalogComponent,
    CommerceQuote,
    EngineeringAssessment,
)
from graph_engine.names import WIRE_MANIFEST

WIRE_DIR = Path(__file__).resolve().parents[3] / "lib" / "contracts" / "dist-wire"


def _load(name: str) -> dict:
    path = WIRE_DIR / name
    if not path.exists():
        pytest.skip(
            f"{path} missing — run `pnpm --filter @workspace/contracts run export-wire` first"
        )
    return json.loads(path.read_text())


# ── Temporal names ────────────────────────────────────────────────────────────


def test_wire_manifest_sections_match() -> None:
    ts = _load("wire.json")
    assert set(ts) == set(WIRE_MANIFEST), (
        "wire manifest sections differ between TypeScript and Python"
    )


@pytest.mark.parametrize(
    "section", ["taskQueues", "workflows", "signals", "queries", "activities"]
)
def test_wire_section_matches(section: str) -> None:
    ts = _load("wire.json")[section]
    py = WIRE_MANIFEST[section]

    assert set(ts) == set(py), (
        f"{section}: keys differ. "
        f"only in TS: {sorted(set(ts) - set(py))}, only in Python: {sorted(set(py) - set(ts))}"
    )
    mismatched = {k: (ts[k], py[k]) for k in ts if ts[k] != py[k]}
    assert not mismatched, (
        f"{section}: values differ between languages — Temporal dispatches on these "
        f"strings, so a mismatch means the workflow is never picked up: {mismatched}"
    )


def test_workflow_and_signal_names_are_registered_on_the_class() -> None:
    """Guards the other half: the constant is right but the decorator forgot it."""
    from graph_engine.names import Query, Signal, Workflow
    from graph_engine.temporal.workflows import ConfigurationSession

    defn = ConfigurationSession.__temporal_workflow_definition  # type: ignore[attr-defined]
    assert defn.name == Workflow.CONFIGURATION_SESSION

    registered_signals = set(defn.signals)
    for expected in (
        Signal.ADD_COMPONENT,
        Signal.REMOVE_COMPONENT,
        Signal.APPLY_PROPOSAL,
        Signal.REQUEST_CHECKOUT,
        Signal.ABANDON,
    ):
        assert expected in registered_signals, f"signal {expected!r} not registered"

    registered_queries = set(defn.queries)
    for expected in (Query.CURRENT_CONFIGURATION, Query.REVISION):
        assert expected in registered_queries, f"query {expected!r} not registered"


def test_activity_names_are_registered() -> None:
    from graph_engine.names import Activity
    from graph_engine.temporal.activities import GraphActivities

    registered = {
        getattr(getattr(GraphActivities, attr), "__temporal_activity_definition").name
        for attr in dir(GraphActivities)
        if hasattr(getattr(GraphActivities, attr, None), "__temporal_activity_definition")
    }
    for expected in (
        Activity.SEARCH_CANDIDATES,
        Activity.RESOLVE_COMPONENTS,
        Activity.ASSESS_COMPATIBILITY,
        Activity.PRICE_CONFIGURATION,
        Activity.SYNC_CATALOG_PAGE,
        Activity.BUILD_CART_URL,
    ):
        assert expected in registered, f"activity {expected!r} not registered on the class"


# ── Field-level schema parity ─────────────────────────────────────────────────


def _ts_props(schema_name: str) -> set[str]:
    return set(_load("schema.json")["schemas"][schema_name].get("properties", {}).keys())


def _py_props(model: type) -> set[str]:
    """Pydantic serialises by alias (camelCase), which is the wire spelling."""
    return {
        field.alias or name
        for name, field in model.model_fields.items()  # type: ignore[attr-defined]
    }


@pytest.mark.parametrize(
    ("schema_name", "model"),
    [
        ("CatalogComponent", CatalogComponent),
        ("EngineeringAssessment", EngineeringAssessment),
        ("CommerceQuote", CommerceQuote),
    ],
)
def test_top_level_fields_match(schema_name: str, model: type) -> None:
    ts = _ts_props(schema_name)
    py = _py_props(model)
    assert ts == py, (
        f"{schema_name}: field sets differ. "
        f"only in TS: {sorted(ts - py)}, only in Python: {sorted(py - ts)}"
    )


def test_python_serialises_camel_case() -> None:
    """A snake_case payload on the wire would fail Zod validation in the UI."""
    from graph_engine.contracts import MassBudget

    dumped = MassBudget(
        platform_dry_g=1000,
        payload_g=500,
        battery_g=800,
        total_g=2300,
        max_takeoff_g=4000,
        utilization=0.575,
        headroom_g=1700,
    ).model_dump(by_alias=True)

    assert "platformDryG" in dumped
    assert "platform_dry_g" not in dumped
