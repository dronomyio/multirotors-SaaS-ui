"""Qdrant-backed vector storage: catalog semantics and assistant memory.

Two collections, deliberately separate because they have different lifecycles
and different blast radii:

``catalog``
    One point per component. Rebuilt from the graph and the MySQL cache. Safe to
    drop and re-index at any time — it holds no user data.

``memory``
    Assistant memory: durable facts about a customer's build and preferences.
    Scoped per session, and never used to answer a question about price,
    availability, or compatibility. Memory recalls *what the customer wants*,
    never *what something costs* — a remembered price is a stale price, and this
    codebase has already been bitten once by numbers that felt authoritative
    because they were nearby.
"""

from __future__ import annotations

import hashlib
import os
import uuid
from dataclasses import dataclass, field
from typing import Any, Protocol

from qdrant_client import QdrantClient, models

CATALOG_COLLECTION = "multirotors_catalog"
MEMORY_COLLECTION = "multirotors_memory"

#: Namespace for deterministic point IDs. Same handle → same UUID → upsert
#: replaces rather than duplicating, so re-indexing is idempotent.
_POINT_NAMESPACE = uuid.UUID("6f1b0f5a-3c2e-4a1d-9f0b-2d5c8e7a1b34")


def point_id(key: str) -> str:
    return str(uuid.uuid5(_POINT_NAMESPACE, key))


class Embedder(Protocol):
    """Injected so tests need neither a model download nor a network call."""

    dimension: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class HashEmbedder:
    """Deterministic bag-of-words hashing embedder.

    Not competitive with a real model, but it is dependency-free, offline, and
    stable across runs — which makes it the right default for tests and for a
    first boot before anyone has configured an embedding provider. Swap in an
    OpenAI or local model in production by passing a different `Embedder`.
    """

    def __init__(self, dimension: int = 384) -> None:
        self.dimension = dimension

    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for text in texts:
            vec = [0.0] * self.dimension
            for token in _tokenize(text):
                digest = hashlib.blake2b(token.encode(), digest_size=8).digest()
                idx = int.from_bytes(digest[:4], "big") % self.dimension
                sign = 1.0 if digest[4] & 1 else -1.0
                vec[idx] += sign
            norm = sum(v * v for v in vec) ** 0.5
            out.append([v / norm for v in vec] if norm else vec)
        return out


def _tokenize(text: str) -> list[str]:
    import re

    return [t for t in re.split(r"[^a-z0-9]+", text.lower()) if len(t) > 1]


@dataclass(frozen=True)
class CatalogPoint:
    handle: str
    title: str
    kind: str
    summary: str = ""
    capabilities: tuple[str, ...] = ()
    missions: tuple[str, ...] = ()

    def text(self) -> str:
        """What gets embedded. Capabilities matter more than marketing copy."""
        return " ".join(
            [
                self.title,
                self.kind.replace("_", " "),
                " ".join(c.replace("_", " ") for c in self.capabilities),
                " ".join(m.replace("_", " ") for m in self.missions),
                self.summary,
            ]
        ).strip()


@dataclass(frozen=True)
class MemoryPoint:
    session_id: str
    kind: str  # "preference" | "constraint" | "decision" | "rejection"
    text: str
    created_at: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Hit:
    key: str
    score: float
    payload: dict[str, Any]


class VectorStore:
    def __init__(self, client: QdrantClient, embedder: Embedder | None = None) -> None:
        self._client = client
        self._embedder = embedder or HashEmbedder()

    @classmethod
    def from_env(cls, embedder: Embedder | None = None) -> VectorStore:
        url = os.environ.get("QDRANT_URL", "http://localhost:6333")
        api_key = os.environ.get("QDRANT_API_KEY") or None
        return cls(QdrantClient(url=url, api_key=api_key), embedder)

    @classmethod
    def in_memory(cls, embedder: Embedder | None = None) -> VectorStore:
        """Used by tests. Qdrant's local mode needs no server."""
        return cls(QdrantClient(location=":memory:"), embedder)

    def ensure_collections(self) -> None:
        for name in (CATALOG_COLLECTION, MEMORY_COLLECTION):
            if not self._client.collection_exists(name):
                self._client.create_collection(
                    collection_name=name,
                    vectors_config=models.VectorParams(
                        size=self._embedder.dimension, distance=models.Distance.COSINE
                    ),
                )
        # Memory is always read session-scoped; without this the filter is a scan.
        self._client.create_payload_index(
            collection_name=MEMORY_COLLECTION,
            field_name="session_id",
            field_schema=models.PayloadSchemaType.KEYWORD,
        )

    # ── Catalog ──────────────────────────────────────────────────────────────

    def index_catalog(self, points: list[CatalogPoint]) -> int:
        if not points:
            return 0
        vectors = self._embedder.embed([p.text() for p in points])
        self._client.upsert(
            collection_name=CATALOG_COLLECTION,
            points=[
                models.PointStruct(
                    id=point_id(p.handle),
                    vector=vec,
                    payload={
                        "handle": p.handle,
                        "title": p.title,
                        "kind": p.kind,
                        "capabilities": list(p.capabilities),
                        "missions": list(p.missions),
                    },
                )
                for p, vec in zip(points, vectors, strict=True)
            ],
        )
        return len(points)

    def search_catalog(
        self, query: str, *, limit: int = 12, kind: str | None = None
    ) -> list[Hit]:
        vector = self._embedder.embed([query])[0]
        flt = (
            models.Filter(
                must=[models.FieldCondition(key="kind", match=models.MatchValue(value=kind))]
            )
            if kind
            else None
        )
        response = self._client.query_points(
            collection_name=CATALOG_COLLECTION,
            query=vector,
            limit=limit,
            query_filter=flt,
            with_payload=True,
        )
        return [
            Hit(key=str(p.payload.get("handle", "")), score=p.score, payload=dict(p.payload or {}))
            for p in response.points
        ]

    # ── Memory ───────────────────────────────────────────────────────────────

    def remember(self, point: MemoryPoint) -> str:
        vector = self._embedder.embed([point.text])[0]
        # Content-addressed: saying the same thing twice does not create two memories.
        pid = point_id(f"{point.session_id}:{point.kind}:{point.text}")
        self._client.upsert(
            collection_name=MEMORY_COLLECTION,
            points=[
                models.PointStruct(
                    id=pid,
                    vector=vector,
                    payload={
                        "session_id": point.session_id,
                        "kind": point.kind,
                        "text": point.text,
                        "created_at": point.created_at,
                        **point.metadata,
                    },
                )
            ],
        )
        return pid

    def recall(self, session_id: str, query: str, *, limit: int = 5) -> list[Hit]:
        """Session-scoped recall. Never cross-session — one customer's build is
        not context for another's, and leaking it would be both wrong and creepy."""
        vector = self._embedder.embed([query])[0]
        response = self._client.query_points(
            collection_name=MEMORY_COLLECTION,
            query=vector,
            limit=limit,
            query_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="session_id", match=models.MatchValue(value=session_id)
                    )
                ]
            ),
            with_payload=True,
        )
        return [
            Hit(key=str(p.id), score=p.score, payload=dict(p.payload or {}))
            for p in response.points
        ]

    def forget_session(self, session_id: str) -> None:
        """Right-to-erasure, and the thing you need when a session goes wrong."""
        self._client.delete(
            collection_name=MEMORY_COLLECTION,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="session_id", match=models.MatchValue(value=session_id)
                        )
                    ]
                )
            ),
        )


def reciprocal_rank_fusion(
    rankings: list[list[str]], *, k: int = 60, limit: int = 12
) -> list[str]:
    """Fuse graph and vector result lists without tuning a score threshold.

    RRF only needs *rank*, so it doesn't care that Qdrant returns cosine
    similarity and the graph returns an ordinal. Cross-scale score blending
    needs constant re-tuning; this does not.
    """
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, key in enumerate(ranking):
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank + 1)
    return [key for key, _ in sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))][:limit]
