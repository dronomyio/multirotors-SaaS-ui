"""Ontology-aware component search.

Three retrievers, fused. Each is blind to what the others find, which is the
point — the failure modes are different:

**Capability search** (graph, precise)
    Mission → required capabilities → components that PROVIDE them. Exact, and
    it understands that "solar inspection" implies GNSS. Misses anything the
    ontology hasn't been told about.

**Semantic search** (Qdrant, recall)
    Free-text against embedded component descriptions. Catches the product
    nobody tagged, and the phrasing the ontology has no word for. Will also
    cheerfully return a T-shirt with "thermal" in the title.

**Full-text** (Neo4j, fallback)
    Works when Qdrant is down, which it will be at some point.

Fusion is reciprocal rank fusion — see `memory.store`. The result is a *candidate
list*, not an answer. Compatibility and pricing still go through the rules engine
and Shopify.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from graph_engine.memory.store import VectorStore, reciprocal_rank_fusion
from graph_engine.ontology.schema import expand_mission

# Components that PROVIDE every capability the mission needs, ranked by how many
# they cover. `coalesce(c.rank, 100)` lets merchandising override ties.
CAPABILITY_SEARCH = """
MATCH (c:Component)-[:PROVIDES]->(cap:Capability)
WHERE cap.name IN $capabilities
  AND ($kinds = [] OR c.kind IN $kinds)
WITH c, count(DISTINCT cap) AS covered
ORDER BY covered DESC, coalesce(c.rank, 100), c.handle
LIMIT $limit
RETURN c.handle AS handle, covered
"""

# Components whose consumed interfaces are all offered by something already in
# the build. This is the "what else can I actually attach?" query.
ATTACHABLE_SEARCH = """
MATCH (existing:Component)-[:PROVIDES]->(i:Interface)
WHERE existing.handle IN $selected
WITH collect(DISTINCT i.name) AS available
MATCH (c:Component)
WHERE ($kinds = [] OR c.kind IN $kinds)
  AND NOT c.handle IN $selected
  AND all(
        need IN [(c)-[:CONSUMES]->(n:Interface) | n.name]
        WHERE need IN available
      )
RETURN c.handle AS handle
ORDER BY coalesce(c.rank, 100), c.handle
LIMIT $limit
"""

FULLTEXT_SEARCH = """
CALL db.index.fulltext.queryNodes('component_text', $query)
YIELD node, score
WHERE ($kinds = [] OR node.kind IN $kinds)
RETURN node.handle AS handle, score
ORDER BY score DESC
LIMIT $limit
"""

COMPONENT_FACTS = """
MATCH (c:Component)
WHERE c.handle IN $handles
OPTIONAL MATCH (c)-[p:PROVIDES]->(pi:Interface)
OPTIONAL MATCH (c)-[co:CONSUMES]->(ci:Interface)
OPTIONAL MATCH (c)-[:PROVIDES]->(cap:Capability)
OPTIONAL MATCH (c)-[:SUITED_FOR]->(m:Mission)
RETURN c.handle AS handle,
       c.kind AS kind,
       collect(DISTINCT {name: pi.name, count: coalesce(p.count, 1)}) AS provides_interfaces,
       collect(DISTINCT {name: ci.name, count: coalesce(co.count, 1)}) AS consumes_interfaces,
       collect(DISTINCT cap.name) AS capabilities,
       collect(DISTINCT m.name) AS missions
"""


@dataclass(frozen=True)
class SearchResult:
    handles: list[str]
    #: Kept separate so observability can answer "which retriever found it?".
    from_graph: list[str]
    from_vector: list[str]
    capabilities_sought: frozenset[str]
    degraded: bool = False
    degraded_reason: str | None = None


class OntologySearch:
    def __init__(self, graph_read, vectors: VectorStore | None = None) -> None:
        """`graph_read(cypher, **params) -> list[dict]`. Injected to keep this
        testable without a driver."""
        self._read = graph_read
        self._vectors = vectors

    async def find_candidates(
        self,
        *,
        mission: str,
        kinds: Sequence[str] = (),
        free_text: str = "",
        selected: Sequence[str] = (),
        limit: int = 12,
    ) -> SearchResult:
        capabilities = expand_mission(mission)
        kind_list = list(kinds)

        graph_hits: list[str] = []
        if capabilities:
            rows = await self._read(
                CAPABILITY_SEARCH,
                capabilities=sorted(capabilities),
                kinds=kind_list,
                limit=limit * 2,
            )
            graph_hits = [r["handle"] for r in rows]

        # If the customer already has parts selected, what can actually attach
        # matters more than what merely suits the mission.
        if selected:
            rows = await self._read(
                ATTACHABLE_SEARCH, selected=list(selected), kinds=kind_list, limit=limit * 2
            )
            attachable = [r["handle"] for r in rows]
            graph_hits = _preserve_order(attachable + graph_hits)

        vector_hits: list[str] = []
        degraded = False
        reason: str | None = None
        query = free_text or mission.replace("_", " ")

        if self._vectors is not None:
            try:
                hits = self._vectors.search_catalog(
                    query, limit=limit * 2, kind=kind_list[0] if len(kind_list) == 1 else None
                )
                vector_hits = [h.key for h in hits if h.key]
            except Exception as exc:  # noqa: BLE001 — degrade, never fail the turn
                degraded = True
                reason = f"vector search unavailable: {type(exc).__name__}"

        if not vector_hits and free_text:
            try:
                rows = await self._read(
                    FULLTEXT_SEARCH, query=free_text, kinds=kind_list, limit=limit * 2
                )
                vector_hits = [r["handle"] for r in rows]
            except Exception as exc:  # noqa: BLE001
                degraded = True
                reason = (reason or "") + f" fulltext unavailable: {type(exc).__name__}"

        fused = reciprocal_rank_fusion([graph_hits, vector_hits], limit=limit)

        return SearchResult(
            handles=fused,
            from_graph=graph_hits[:limit],
            from_vector=vector_hits[:limit],
            capabilities_sought=capabilities,
            degraded=degraded,
            degraded_reason=reason.strip() if reason else None,
        )

    async def component_facts(self, handles: Sequence[str]) -> list[dict]:
        if not handles:
            return []
        return await self._read(COMPONENT_FACTS, handles=list(handles))


def _preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out
