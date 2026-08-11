"""Catalog-cache tests. SQLite in-memory, so no MySQL server is needed in CI.

The behaviour under test is the same either way: the cache must refuse to serve
a price it cannot vouch for.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine

from graph_engine.cache.repository import CatalogCache, StaleCacheError
from graph_engine.contracts import apply_rate_bps, cents_from_decimal_string

NOW = datetime(2026, 8, 11, 12, 0, 0)


@pytest.fixture
def cache() -> CatalogCache:
    c = CatalogCache(create_engine("sqlite://", future=True))
    c.create_all()
    return c


def variant(handle: str, price_cents: int, *, available: bool = True) -> dict[str, object]:
    return {
        "variant_id": f"v-{handle}",
        "product_id": f"p-{handle}",
        "handle": handle,
        "sku": handle.upper(),
        "title": handle.replace("-", " ").title(),
        "vendor": "Test",
        "product_type": "drone",
        "body_text": "",
        "price_cents": price_cents,
        "currency": "USD",
        "available_for_sale": available,
        "image_url": None,
        "product_url": None,
    }


# ── Money ─────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("1299.00", 129900), ("1299.9", 129990), ("1299", 129900), ("0.05", 5), ("bogus", None)],
)
def test_shopify_price_parsing(raw: str, expected: int | None) -> None:
    assert cents_from_decimal_string(raw) == expected


def test_tax_stays_in_integers() -> None:
    # 8.5% of $1,299.00 = $110.415 -> $110.42, with no float anywhere
    assert apply_rate_bps(129900, 850) == 11042


# ── Freshness ─────────────────────────────────────────────────────────────────


def test_fresh_rows_are_served(cache: CatalogCache) -> None:
    cache.upsert_variants([variant("voxl2", 129900)], now=NOW)
    rows = cache.require_fresh(["voxl2"], now=NOW, max_age=timedelta(minutes=5))
    assert rows["voxl2"].price_cents == 129900


def test_stale_rows_are_refused_not_quietly_served(cache: CatalogCache) -> None:
    cache.upsert_variants([variant("voxl2", 129900)], now=NOW - timedelta(days=3))
    with pytest.raises(StaleCacheError) as exc:
        cache.require_fresh(["voxl2"], now=NOW, max_age=timedelta(minutes=5))
    assert exc.value.stale == ["voxl2"]


def test_missing_handles_are_reported(cache: CatalogCache) -> None:
    cache.upsert_variants([variant("voxl2", 129900)], now=NOW)
    with pytest.raises(StaleCacheError) as exc:
        cache.require_fresh(["voxl2", "ghost"], now=NOW, max_age=timedelta(minutes=5))
    assert exc.value.missing == ["ghost"]


def test_partial_answers_are_available_when_the_caller_can_cope(cache: CatalogCache) -> None:
    cache.upsert_variants([variant("voxl2", 129900)], now=NOW)
    fresh, missing, stale = cache.variants_by_handle(
        ["voxl2", "ghost"], now=NOW, max_age=timedelta(minutes=5)
    )
    assert set(fresh) == {"voxl2"}
    assert missing == ["ghost"]
    assert stale == []


# ── Upsert ────────────────────────────────────────────────────────────────────


def test_upsert_is_idempotent_so_activity_retries_are_safe(cache: CatalogCache) -> None:
    cache.upsert_variants([variant("voxl2", 129900)], now=NOW)
    cache.upsert_variants([variant("voxl2", 129900)], now=NOW)
    rows = cache.require_fresh(["voxl2"], now=NOW, max_age=timedelta(minutes=5))
    assert len(rows) == 1


def test_upsert_updates_price_in_place(cache: CatalogCache) -> None:
    cache.upsert_variants([variant("voxl2", 129900)], now=NOW - timedelta(hours=1))
    cache.upsert_variants([variant("voxl2", 99900)], now=NOW)
    rows = cache.require_fresh(["voxl2"], now=NOW, max_age=timedelta(minutes=5))
    assert rows["voxl2"].price_cents == 99900


# ── Search ────────────────────────────────────────────────────────────────────


def test_search_scores_by_term_hits(cache: CatalogCache) -> None:
    cache.upsert_variants(
        [variant("fpv-drone-x", 50000), variant("lidar-sensor", 80000)], now=NOW
    )
    results = cache.search(["lidar"], limit=5)
    assert [r.handle for r in results] == ["lidar-sensor"]


def test_search_returns_empty_rather_than_guessing(cache: CatalogCache) -> None:
    cache.upsert_variants([variant("fpv-drone-x", 50000)], now=NOW)
    assert cache.search(["submarine"]) == []


# ── Collections ───────────────────────────────────────────────────────────────


def test_membership_replace_is_idempotent(cache: CatalogCache) -> None:
    cache.replace_memberships("lidar", ["a", "b"])
    cache.replace_memberships("lidar", ["b", "c"])
    assert sorted(cache.collections_for_product("b")) == ["lidar"]
    assert cache.collections_for_product("a") == []
