"""Reads and writes against the MySQL catalog cache.

The one rule every method here enforces: a caller must state how stale a price
it will tolerate, and gets told when the cache cannot meet that. There is no
"just give me whatever you have" accessor, because that is how a three-day-old
price ends up on a quote.
"""

from __future__ import annotations

import os
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import Engine, create_engine, select
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.orm import Session, sessionmaker

from graph_engine.cache.models import (
    Base,
    CachedCollection,
    CachedVariant,
    CollectionMembership,
    SyncCursor,
)
from graph_engine.contracts import (
    CommerceFacts,
    InventoryState,
    Money,
)


@dataclass(frozen=True)
class VariantRow:
    variant_id: str
    handle: str
    sku: str
    title: str
    vendor: str
    price_cents: int
    currency: str
    available_for_sale: bool
    image_url: str | None
    product_url: str | None
    synced_at: datetime

    def to_commerce_facts(self) -> CommerceFacts:
        return CommerceFacts(
            variant_id=self.variant_id,
            sku=self.sku or self.variant_id,
            price=Money(amount=self.price_cents, currency="USD"),
            available_for_sale=self.available_for_sale,
            inventory=(
                InventoryState.IN_STOCK if self.available_for_sale else InventoryState.BACKORDER
            ),
        )


class StaleCacheError(RuntimeError):
    """Raised when the cache cannot satisfy the caller's freshness requirement.

    Callers should re-sync and retry rather than degrade to a stale price. The
    Temporal activity that wraps pricing treats this as retryable.
    """

    def __init__(self, missing: Sequence[str], stale: Sequence[str], max_age: timedelta) -> None:
        self.missing = list(missing)
        self.stale = list(stale)
        super().__init__(
            f"catalog cache cannot serve a quote within {max_age}: "
            f"{len(self.missing)} missing, {len(self.stale)} stale"
        )


def build_engine(url: str | None = None) -> Engine:
    """MySQL by default; the tests pass a SQLite URL so they need no server."""
    resolved = url or os.environ.get(
        "CATALOG_CACHE_URL", "mysql+pymysql://root@localhost:3306/multirotors_cache"
    )
    kwargs: dict[str, object] = {"future": True, "pool_pre_ping": True}
    if resolved.startswith("mysql"):
        # Recycle below MySQL's default wait_timeout so long-lived workers do not
        # wake up holding a connection the server closed hours ago.
        kwargs["pool_recycle"] = 1800
    return create_engine(resolved, **kwargs)  # type: ignore[arg-type]


class CatalogCache:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine
        self._session = sessionmaker(engine, expire_on_commit=False, future=True)

    @classmethod
    def from_env(cls) -> CatalogCache:
        return cls(build_engine())

    def create_all(self) -> None:
        Base.metadata.create_all(self._engine)

    def session(self) -> Session:
        return self._session()

    # ── Reads ────────────────────────────────────────────────────────────────

    def variants_by_handle(
        self, handles: Sequence[str], *, now: datetime, max_age: timedelta
    ) -> tuple[dict[str, VariantRow], list[str], list[str]]:
        """Returns (fresh rows keyed by handle, missing handles, stale handles)."""
        if not handles:
            return {}, [], []

        cutoff = now - max_age
        with self.session() as s:
            rows = s.scalars(
                select(CachedVariant).where(CachedVariant.handle.in_(list(handles)))
            ).all()

        by_handle: dict[str, VariantRow] = {}
        stale: list[str] = []
        for row in rows:
            v = VariantRow(
                variant_id=row.variant_id,
                handle=row.handle,
                sku=row.sku,
                title=row.title,
                vendor=row.vendor,
                price_cents=row.price_cents,
                currency=row.currency,
                available_for_sale=row.available_for_sale,
                image_url=row.image_url,
                product_url=row.product_url,
                synced_at=row.synced_at,
            )
            if row.synced_at < cutoff:
                stale.append(row.handle)
            else:
                by_handle[row.handle] = v

        missing = [h for h in handles if h not in by_handle and h not in stale]
        return by_handle, missing, stale

    def require_fresh(
        self, handles: Sequence[str], *, now: datetime, max_age: timedelta
    ) -> dict[str, VariantRow]:
        """Like ``variants_by_handle`` but refuses to return a partial answer."""
        fresh, missing, stale = self.variants_by_handle(handles, now=now, max_age=max_age)
        if missing or stale:
            raise StaleCacheError(missing, stale, max_age)
        return fresh

    def search(self, terms: Sequence[str], *, limit: int = 12) -> list[VariantRow]:
        """Keyword scoring over cached text. Replaces refetching the whole catalog."""
        with self.session() as s:
            rows = s.scalars(select(CachedVariant)).all()

        lowered = [t.lower() for t in terms if t]
        scored: list[tuple[int, CachedVariant]] = []
        for row in rows:
            haystack = " ".join(
                (row.title, row.handle, row.product_type, row.vendor, row.sku)
            ).lower()
            score = sum(1 for t in lowered if t in haystack)
            if score:
                scored.append((score, row))

        scored.sort(key=lambda pair: (-pair[0], pair[1].handle))
        return [
            VariantRow(
                variant_id=r.variant_id,
                handle=r.handle,
                sku=r.sku,
                title=r.title,
                vendor=r.vendor,
                price_cents=r.price_cents,
                currency=r.currency,
                available_for_sale=r.available_for_sale,
                image_url=r.image_url,
                product_url=r.product_url,
                synced_at=r.synced_at,
            )
            for _, r in scored[:limit]
        ]

    def collections_for_product(self, product_handle: str) -> list[str]:
        with self.session() as s:
            return list(
                s.scalars(
                    select(CollectionMembership.collection_handle).where(
                        CollectionMembership.product_handle == product_handle
                    )
                ).all()
            )

    # ── Writes ───────────────────────────────────────────────────────────────

    def upsert_variants(self, rows: Iterable[dict[str, object]], *, now: datetime) -> int:
        """Idempotent bulk upsert. Safe to replay when a sync activity retries."""
        payload = [{**r, "synced_at": now} for r in rows]
        if not payload:
            return 0

        with self.session() as s:
            dialect = self._engine.dialect.name
            if dialect == "mysql":
                stmt = mysql_insert(CachedVariant).values(payload)
                update_cols = {
                    c.name: stmt.inserted[c.name]
                    for c in CachedVariant.__table__.columns
                    if c.name != "variant_id"
                }
                s.execute(stmt.on_duplicate_key_update(**update_cols))
            else:
                # SQLite path, used by the tests.
                for item in payload:
                    s.merge(CachedVariant(**item))  # type: ignore[arg-type]
            s.commit()
        return len(payload)

    def upsert_collections(self, rows: Iterable[dict[str, object]]) -> int:
        items = list(rows)
        with self.session() as s:
            for item in items:
                s.merge(CachedCollection(**item))  # type: ignore[arg-type]
            s.commit()
        return len(items)

    def replace_memberships(self, collection_handle: str, product_handles: Sequence[str]) -> None:
        with self.session() as s:
            existing = s.scalars(
                select(CollectionMembership).where(
                    CollectionMembership.collection_handle == collection_handle
                )
            ).all()
            for row in existing:
                s.delete(row)
            for position, handle in enumerate(product_handles):
                s.add(
                    CollectionMembership(
                        collection_handle=collection_handle,
                        product_handle=handle,
                        position=position,
                    )
                )
            s.commit()

    def record_sync(self, name: str, *, page: int, completed_at: datetime | None,
                    error: str | None = None) -> None:
        with self.session() as s:
            cursor = s.get(SyncCursor, name) or SyncCursor(name=name)
            cursor.last_page = page
            cursor.last_completed_at = completed_at
            cursor.last_error = error
            s.merge(cursor)
            s.commit()

    def last_sync(self, name: str) -> SyncCursor | None:
        with self.session() as s:
            return s.get(SyncCursor, name)
