"""Vector store and memory tests. Qdrant runs in local mode — no server."""

from __future__ import annotations

import warnings

import pytest

from graph_engine.memory.store import (
    CatalogPoint,
    HashEmbedder,
    MemoryPoint,
    VectorStore,
    point_id,
    reciprocal_rank_fusion,
)

NOW = "2026-08-11T12:00:00Z"


@pytest.fixture
def store() -> VectorStore:
    s = VectorStore.in_memory()
    with warnings.catch_warnings():
        # Local Qdrant warns that payload indexes are a no-op. Expected.
        warnings.simplefilter("ignore", UserWarning)
        s.ensure_collections()
    return s


CATALOG = [
    CatalogPoint(
        handle="flir-boson",
        title="FLIR Boson Radiometric Thermal Camera",
        kind="sensor",
        capabilities=("thermal_imaging", "radiometric_measurement"),
        missions=("thermal_inspection", "solar_inspection"),
    ),
    CatalogPoint(
        handle="voxl2",
        title="VOXL 2 Autonomy Compute",
        kind="compute",
        capabilities=("vio", "slam", "onboard_inference"),
        missions=("indoor_gps_denied",),
    ),
    CatalogPoint(
        handle="ouster-os1",
        title="Ouster OS1 LiDAR",
        kind="sensor",
        capabilities=("lidar_ranging", "depth_sensing"),
        missions=("mapping_survey",),
    ),
]


# ── Embedding ─────────────────────────────────────────────────────────────────


def test_embedder_is_deterministic() -> None:
    e = HashEmbedder()
    assert e.embed(["thermal camera"]) == e.embed(["thermal camera"])


def test_embeddings_are_unit_length() -> None:
    [vec] = HashEmbedder().embed(["thermal inspection drone"])
    assert abs(sum(v * v for v in vec) ** 0.5 - 1.0) < 1e-9


def test_empty_text_does_not_crash() -> None:
    [vec] = HashEmbedder().embed([""])
    assert len(vec) == HashEmbedder().dimension


# ── Catalog search ────────────────────────────────────────────────────────────


def test_semantic_search_ranks_the_relevant_component_first(store: VectorStore) -> None:
    store.index_catalog(CATALOG)
    hits = store.search_catalog("thermal inspection camera", limit=3)
    assert hits[0].key == "flir-boson"


def test_search_can_filter_by_kind(store: VectorStore) -> None:
    store.index_catalog(CATALOG)
    hits = store.search_catalog("autonomy", limit=5, kind="compute")
    assert {h.key for h in hits} == {"voxl2"}


def test_reindexing_is_idempotent(store: VectorStore) -> None:
    store.index_catalog(CATALOG)
    store.index_catalog(CATALOG)
    hits = store.search_catalog("thermal", limit=10)
    assert len([h for h in hits if h.key == "flir-boson"]) == 1


def test_point_ids_are_stable_across_runs() -> None:
    assert point_id("flir-boson") == point_id("flir-boson")
    assert point_id("flir-boson") != point_id("voxl2")


# ── Memory ────────────────────────────────────────────────────────────────────


def test_recall_returns_session_memories(store: VectorStore) -> None:
    store.remember(
        MemoryPoint("sess-1", "constraint", "Budget is under $7,000", NOW)
    )
    store.remember(MemoryPoint("sess-1", "preference", "Prefers Blue UAS compliant", NOW))

    hits = store.recall("sess-1", "how much can they spend", limit=3)
    assert any("7,000" in h.payload["text"] for h in hits)


def test_memory_never_leaks_across_sessions(store: VectorStore) -> None:
    store.remember(MemoryPoint("sess-1", "constraint", "Budget is under $7,000", NOW))
    store.remember(MemoryPoint("sess-2", "constraint", "Budget is under $50,000", NOW))

    hits = store.recall("sess-1", "budget", limit=10)
    assert hits, "expected at least one memory for sess-1"
    assert all(h.payload["session_id"] == "sess-1" for h in hits)
    assert all("50,000" not in h.payload["text"] for h in hits)


def test_remembering_the_same_fact_twice_stores_one_memory(store: VectorStore) -> None:
    a = store.remember(MemoryPoint("sess-1", "constraint", "Budget under $7,000", NOW))
    b = store.remember(MemoryPoint("sess-1", "constraint", "Budget under $7,000", NOW))
    assert a == b
    assert len(store.recall("sess-1", "budget", limit=10)) == 1


def test_forget_session_erases_everything_for_that_session(store: VectorStore) -> None:
    store.remember(MemoryPoint("sess-1", "constraint", "Budget under $7,000", NOW))
    store.remember(MemoryPoint("sess-2", "constraint", "Budget under $50,000", NOW))

    store.forget_session("sess-1")
    assert store.recall("sess-1", "budget", limit=10) == []
    assert store.recall("sess-2", "budget", limit=10) != []


def test_recall_on_unknown_session_is_empty_not_an_error(store: VectorStore) -> None:
    assert store.recall("never-existed", "anything") == []


# ── Fusion ────────────────────────────────────────────────────────────────────


def test_rrf_rewards_agreement_between_retrievers() -> None:
    graph = ["a", "b", "c"]
    vector = ["c", "a", "z"]
    fused = reciprocal_rank_fusion([graph, vector], limit=4)
    # 'a' is high in both; 'c' is top of one and bottom of the other.
    assert fused[0] == "a"
    assert set(fused) == {"a", "b", "c", "z"}


def test_rrf_surfaces_items_only_one_retriever_found() -> None:
    fused = reciprocal_rank_fusion([["a", "b"], ["z"]], limit=3)
    assert "z" in fused, "a vector-only hit must still be reachable"


def test_rrf_handles_an_empty_retriever() -> None:
    assert reciprocal_rank_fusion([["a", "b"], []], limit=5) == ["a", "b"]


def test_rrf_is_deterministic_on_ties() -> None:
    a = reciprocal_rank_fusion([["x"], ["y"]], limit=2)
    b = reciprocal_rank_fusion([["x"], ["y"]], limit=2)
    assert a == b
