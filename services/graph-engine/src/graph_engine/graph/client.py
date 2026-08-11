"""Neo4j access. The graph owns engineering relationships, nothing else.

Division of ownership, restated because it is the thing that goes wrong:

* **Shopify** owns SKU, price, inventory, purchasability.
* **Neo4j** owns compatibility edges, mount points, and engineering specs.
* **MySQL** caches Shopify so we stop refetching 500 products per agent turn.

A ``:Component`` node therefore stores a ``variant_id`` but *never* a price. If
you ever find a price property on a graph node, it is stale by definition and
someone is about to quote it.
"""

from __future__ import annotations

import os
from collections.abc import Sequence
from typing import Any

from neo4j import AsyncDriver, AsyncGraphDatabase

from graph_engine.contracts import (
    AutonomyCapability,
    ComponentKind,
    ComponentSpec,
    SensorModality,
)
from graph_engine.graph.rules import GraphEdges

# ── Schema DDL ────────────────────────────────────────────────────────────────

#: Run once at startup. Constraints are idempotent in Neo4j 5+.
SCHEMA_STATEMENTS: tuple[str, ...] = (
    "CREATE CONSTRAINT component_handle IF NOT EXISTS "
    "FOR (c:Component) REQUIRE c.handle IS UNIQUE",
    "CREATE INDEX component_kind IF NOT EXISTS FOR (c:Component) ON (c.kind)",
    "CREATE INDEX component_variant IF NOT EXISTS FOR (c:Component) ON (c.variant_id)",
    "CREATE INDEX mission_tag IF NOT EXISTS FOR (m:Mission) ON (m.name)",
)

# ── Cypher ────────────────────────────────────────────────────────────────────

RESOLVE_COMPONENTS = """
MATCH (c:Component)
WHERE c.handle IN $handles
RETURN c { .* } AS component
"""

SEARCH_CANDIDATES = """
MATCH (c:Component)
WHERE c.kind IN $kinds
  AND ($mission IS NULL OR EXISTS {
        MATCH (c)-[:SUITED_FOR]->(m:Mission {name: $mission})
      })
  AND ($modalities = [] OR c.modality IN $modalities)
  AND ($autonomy = [] OR any(a IN $autonomy WHERE a IN coalesce(c.supported_autonomy, [])))
RETURN c.handle AS handle
ORDER BY coalesce(c.rank, 100), c.handle
LIMIT $limit
"""

EDGES_AMONG = """
MATCH (a:Component)-[r:COMPATIBLE_WITH|INCOMPATIBLE_WITH]-(b:Component)
WHERE a.handle IN $handles AND b.handle IN $handles AND a.handle < b.handle
RETURN a.handle AS a, b.handle AS b, type(r) AS rel, r.reason AS reason
"""

UPSERT_COMPONENT = """
MERGE (c:Component {handle: $handle})
SET c += $props
RETURN c.handle AS handle
"""

LINK_MISSION = """
MATCH (c:Component {handle: $handle})
MERGE (m:Mission {name: $mission})
MERGE (c)-[:SUITED_FOR]->(m)
"""

SET_COMPATIBILITY = """
MATCH (a:Component {handle: $a}), (b:Component {handle: $b})
MERGE (a)-[r:COMPATIBLE_WITH]->(b)
SET r.reason = $reason, r.verified_at = $verified_at
"""


class GraphClient:
    """Thin async wrapper. One driver per process; sessions are cheap."""

    def __init__(self, driver: AsyncDriver, database: str = "neo4j") -> None:
        self._driver = driver
        self._database = database

    @classmethod
    def from_env(cls) -> GraphClient:
        uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
        user = os.environ.get("NEO4J_USER", "neo4j")
        password = os.environ.get("NEO4J_PASSWORD", "")
        database = os.environ.get("NEO4J_DATABASE", "neo4j")
        driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
        return cls(driver, database)

    async def close(self) -> None:
        await self._driver.close()

    async def verify(self) -> None:
        await self._driver.verify_connectivity()

    async def ensure_schema(self) -> None:
        async with self._driver.session(database=self._database) as session:
            for stmt in SCHEMA_STATEMENTS:
                await session.run(stmt)  # type: ignore[arg-type]

    async def _read(self, cypher: str, **params: Any) -> list[dict[str, Any]]:
        async with self._driver.session(database=self._database) as session:
            result = await session.run(cypher, **params)  # type: ignore[arg-type]
            return [record.data() async for record in result]

    async def _write(self, cypher: str, **params: Any) -> None:
        async with self._driver.session(database=self._database) as session:
            await session.run(cypher, **params)  # type: ignore[arg-type]

    # ── Reads ────────────────────────────────────────────────────────────────

    async def search_candidates(
        self,
        *,
        mission: str | None,
        kinds: Sequence[ComponentKind],
        modalities: Sequence[SensorModality],
        autonomy: Sequence[AutonomyCapability],
        limit: int,
    ) -> list[str]:
        rows = await self._read(
            SEARCH_CANDIDATES,
            mission=mission,
            kinds=[k.value for k in kinds],
            modalities=[m.value for m in modalities],
            autonomy=[a.value for a in autonomy],
            limit=limit,
        )
        return [row["handle"] for row in rows]

    async def component_specs(self, handles: Sequence[str]) -> dict[str, ComponentSpec]:
        """Graph-side engineering specs, keyed by handle. Commerce comes from MySQL."""
        rows = await self._read(RESOLVE_COMPONENTS, handles=list(handles))
        specs: dict[str, ComponentSpec] = {}
        for row in rows:
            node = row["component"]
            specs[node["handle"]] = _spec_from_node(node)
        return specs

    async def edges_among(self, handles: Sequence[str]) -> GraphEdges:
        rows = await self._read(EDGES_AMONG, handles=list(handles))
        compatible: set[frozenset[str]] = set()
        incompatible: set[frozenset[str]] = set()
        reasons: dict[frozenset[str], str] = {}

        for row in rows:
            pair = frozenset((row["a"], row["b"]))
            if row["rel"] == "COMPATIBLE_WITH":
                compatible.add(pair)
            else:
                incompatible.add(pair)
            if row.get("reason"):
                reasons[pair] = row["reason"]

        return GraphEdges(
            compatible=frozenset(compatible),
            incompatible=frozenset(incompatible),
            reasons=reasons,
        )

    # ── Writes ───────────────────────────────────────────────────────────────

    async def upsert_component(
        self, handle: str, props: dict[str, Any], missions: Sequence[str] = ()
    ) -> None:
        await self._write(UPSERT_COMPONENT, handle=handle, props=props)
        for mission in missions:
            await self._write(LINK_MISSION, handle=handle, mission=mission)

    async def set_compatible(self, a: str, b: str, reason: str, verified_at: str) -> None:
        lo, hi = sorted((a, b))
        await self._write(SET_COMPATIBILITY, a=lo, b=hi, reason=reason, verified_at=verified_at)


def _spec_from_node(node: dict[str, Any]) -> ComponentSpec:
    """Node properties are flat scalars; missing values stay None rather than 0."""
    return ComponentSpec(
        kind=ComponentKind(node["kind"]),
        mass_g=float(node.get("mass_g") or 0.0),
        typical_power_w=float(node.get("typical_power_w") or 0.0),
        max_takeoff_mass_g=_opt_float(node.get("max_takeoff_mass_g")),
        hover_power_w=_opt_float(node.get("hover_power_w")),
        diagonal_mm=_opt_float(node.get("diagonal_mm")),
        peak_power_w=_opt_float(node.get("peak_power_w")),
        camera_ports=_opt_int(node.get("camera_ports")),
        supported_autonomy=[
            AutonomyCapability(a) for a in (node.get("supported_autonomy") or [])
        ],
        modality=SensorModality(node["modality"]) if node.get("modality") else None,
        interface=node.get("interface"),
        capacity_wh=_opt_float(node.get("capacity_wh")),
        firmware=node.get("firmware"),
    )


def _opt_float(v: Any) -> float | None:
    return float(v) if v is not None else None


def _opt_int(v: Any) -> int | None:
    return int(v) if v is not None else None
