"""MySQL catalog cache — a mirror of Shopify, never a second source of truth.

Why this exists: the agent currently refetches up to 500 products from Shopify's
public API on every catalog search, and an eight-iteration tool loop can do that
a dozen times in one conversation. This table is that data, kept warm.

Why it is only a *cache*: Shopify remains authoritative. Every row carries
``synced_at``, readers must check staleness, and nothing is ever quoted from a
row older than the caller's tolerance. A cache that silently serves a
three-day-old price is worse than no cache at all.

Money is ``BigInteger`` cents. MySQL's ``FLOAT``/``DOUBLE`` for currency is the
same mistake as JavaScript's ``number``, with the added indignity of being
persisted.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class CachedVariant(Base):
    """One Shopify product variant. Keyed by the numeric variant id as text."""

    __tablename__ = "catalog_variant"

    variant_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    product_id: Mapped[str] = mapped_column(String(64), index=True)
    #: Shopify product handle. Joins this cache to a :Component node in Neo4j.
    handle: Mapped[str] = mapped_column(String(191), index=True)
    sku: Mapped[str] = mapped_column(String(191), default="")
    title: Mapped[str] = mapped_column(String(512))
    vendor: Mapped[str] = mapped_column(String(191), default="")
    product_type: Mapped[str] = mapped_column(String(191), default="")
    body_text: Mapped[str] = mapped_column(Text, default="")

    #: Integer cents. Never a float.
    price_cents: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    available_for_sale: Mapped[bool] = mapped_column(Boolean, default=False)
    inventory_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    image_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    product_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    #: When this row was last confirmed against Shopify. Readers check it.
    synced_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), index=True
    )

    __table_args__ = (
        # The hot path: "give me these variants, and tell me if they're fresh."
        Index("ix_variant_handle_synced", "handle", "synced_at"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )


class CachedCollection(Base):
    __tablename__ = "catalog_collection"

    handle: Mapped[str] = mapped_column(String(191), primary_key=True)
    title: Mapped[str] = mapped_column(String(512))
    description: Mapped[str] = mapped_column(Text, default="")
    synced_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = ({"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},)


class CollectionMembership(Base):
    """Which collections a product handle belongs to.

    Replaces the current approach of probing ten hardcoded collection endpoints
    in parallel on every lookup, against a store with roughly a hundred.
    """

    __tablename__ = "catalog_collection_member"

    collection_handle: Mapped[str] = mapped_column(String(191), primary_key=True)
    product_handle: Mapped[str] = mapped_column(String(191), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        Index("ix_member_product", "product_handle"),
        {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"},
    )


class SyncCursor(Base):
    """Bookkeeping for the incremental Shopify sync workflow."""

    __tablename__ = "catalog_sync_cursor"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    last_page: Mapped[int] = mapped_column(Integer, default=0)
    last_completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    #: Populated when a sync run fails, so a stale cache has a visible cause.
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
