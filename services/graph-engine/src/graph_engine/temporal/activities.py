"""Temporal activities — the only place in this service that does I/O.

Every activity is named with an explicit ``name=`` from ``graph_engine.names``,
because the TypeScript side dispatches on those strings. Never let the name
default to the function name; a rename would silently break the bridge.

Mutating activities take an ``idempotency_key`` and are safe to replay: Temporal
retries on the assumption that at-least-once delivery is fine, which is only
true if you make it true.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from temporalio import activity
from temporalio.exceptions import ApplicationError

from graph_engine.cache.repository import CatalogCache, StaleCacheError
from graph_engine.contracts import (
    AssessCompatibilityInput,
    BomLine,
    CatalogComponent,
    CommerceQuote,
    EngineeringAssessment,
    Money,
    PriceConfigurationInput,
    ResolveComponentsInput,
    ResolveComponentsOutput,
    SearchCandidatesInput,
    apply_rate_bps,
)
from graph_engine.graph.client import GraphClient
from graph_engine.graph.rules import assess
from graph_engine.names import Activity

#: Sales tax. Still a single rate — see CLAUDE.md; destination-based rates are
#: the correct fix and are deliberately out of scope for this pass.
TAX_RATE_BPS = 850
FREE_SHIPPING_THRESHOLD_CENTS = 50_000
FLAT_SHIPPING_CENTS = 2_500


@dataclass
class Deps:
    """Injected at worker startup so activities stay testable."""

    graph: GraphClient
    cache: CatalogCache


class GraphActivities:
    """Activities are methods so they can share a driver and a connection pool."""

    def __init__(self, deps: Deps) -> None:
        self._deps = deps

    # ── Reads ────────────────────────────────────────────────────────────────

    @activity.defn(name=Activity.SEARCH_CANDIDATES)
    async def search_candidates(self, inp: SearchCandidatesInput) -> list[str]:
        return await self._deps.graph.search_candidates(
            mission=inp.mission or None,
            kinds=inp.kinds,
            modalities=inp.required_modalities,
            autonomy=inp.required_autonomy,
            limit=inp.limit,
        )

    @activity.defn(name=Activity.RESOLVE_COMPONENTS)
    async def resolve_components(self, inp: ResolveComponentsInput) -> ResolveComponentsOutput:
        """Join Neo4j specs to cached Shopify commerce facts.

        A handle the graph doesn't know, or one with no cached variant, is
        reported in ``missing``. It is never fabricated and never dropped —
        the caller decides what to tell the customer.
        """
        specs = await self._deps.graph.component_specs(inp.handles)
        rows, missing_cache, stale = self._deps.cache.variants_by_handle(
            list(specs.keys()), now=datetime.now(UTC).replace(tzinfo=None), max_age=timedelta(hours=24)
        )

        components: list[CatalogComponent] = []
        for handle, spec in specs.items():
            row = rows.get(handle)
            if row is None:
                continue
            components.append(
                CatalogComponent(
                    handle=handle,
                    kind=spec.kind,
                    title=row.title,
                    vendor=row.vendor,
                    image_url=row.image_url,
                    spec=spec,
                    commerce=row.to_commerce_facts(),
                )
            )

        known = {c.handle for c in components}
        missing = [h for h in inp.handles if h not in known]
        if missing_cache or stale:
            activity.logger.warning(
                "catalog cache incomplete during resolve: missing=%s stale=%s",
                missing_cache,
                stale,
            )
        return ResolveComponentsOutput(components=components, missing=missing)

    @activity.defn(name=Activity.ASSESS_COMPATIBILITY)
    async def assess_compatibility(self, inp: AssessCompatibilityInput) -> EngineeringAssessment:
        resolved = await self.resolve_components(ResolveComponentsInput(handles=inp.handles))
        if resolved.missing:
            raise ApplicationError(
                f"cannot assess: unknown component handles {resolved.missing}",
                type="UnknownHandle",
                non_retryable=True,
            )
        edges = await self._deps.graph.edges_among(inp.handles)
        # Injected rather than read inside, so the rules stay pure and replayable.
        return assess(resolved.components, edges, computed_at=_now_iso())

    @activity.defn(name=Activity.PRICE_CONFIGURATION)
    async def price_configuration(self, inp: PriceConfigurationInput) -> CommerceQuote:
        """Prices from the cache, refusing to serve anything staler than asked for.

        ``StaleCacheError`` propagates as a retryable failure: Temporal will back
        off and retry, and the catalog sync workflow will have refreshed the rows
        by then. Serving a stale price instead would be the silent failure.
        """
        handles = [h for h, _ in inp.lines]
        try:
            rows = self._deps.cache.require_fresh(
                handles,
                now=datetime.now(UTC).replace(tzinfo=None),
                max_age=timedelta(seconds=inp.max_age_seconds),
            )
        except StaleCacheError as exc:
            raise ApplicationError(str(exc), type="StaleCache") from exc

        lines: list[BomLine] = []
        for handle, qty in inp.lines:
            row = rows[handle]
            unit = Money(amount=row.price_cents, currency="USD")
            lines.append(
                BomLine(
                    handle=handle,
                    variant_id=row.variant_id,
                    sku=row.sku or row.variant_id,
                    title=row.title,
                    quantity=qty,
                    unit_price=unit,
                    line_total=unit.times(qty),
                    inventory=row.to_commerce_facts().inventory,
                    available_for_sale=row.available_for_sale,
                )
            )

        subtotal = sum(line.line_total.amount for line in lines)
        tax = apply_rate_bps(subtotal, TAX_RATE_BPS)
        shipping = 0 if subtotal >= FREE_SHIPPING_THRESHOLD_CENTS else FLAT_SHIPPING_CENTS

        return CommerceQuote(
            lines=lines,
            subtotal=Money(amount=subtotal),
            estimated_tax=Money(amount=tax),
            estimated_shipping=Money(amount=shipping),
            total=Money(amount=subtotal + tax + shipping),
            purchasable=all(line.available_for_sale for line in lines),
            priced_at=_now_iso(),
        )

    # ── Writes ───────────────────────────────────────────────────────────────

    @activity.defn(name=Activity.SYNC_CATALOG_PAGE)
    async def sync_catalog_page(self, page: int) -> int:
        """Pull one page of Shopify products into MySQL. Idempotent by variant id."""
        import httpx

        from graph_engine.contracts import cents_from_decimal_string

        domain = _store_domain()
        url = f"https://{domain}/products.json?limit=250&page={page}"

        async with httpx.AsyncClient(timeout=20.0) as http:
            response = await http.get(url, headers={"Accept": "application/json"})
            response.raise_for_status()
            products = response.json().get("products", [])

        rows: list[dict[str, object]] = []
        for product in products:
            for variant in product.get("variants", []):
                cents = cents_from_decimal_string(str(variant.get("price", "")))
                if cents is None:
                    continue
                images = product.get("images") or []
                rows.append(
                    {
                        "variant_id": str(variant["id"]),
                        "product_id": str(product["id"]),
                        "handle": product["handle"],
                        "sku": str(variant.get("sku") or ""),
                        "title": product["title"],
                        "vendor": product.get("vendor") or "",
                        "product_type": product.get("product_type") or "",
                        "body_text": _strip_html(product.get("body_html") or ""),
                        "price_cents": cents,
                        "currency": "USD",
                        "available_for_sale": bool(variant.get("available", False)),
                        "image_url": images[0]["src"] if images else None,
                        "product_url": f"https://{domain}/products/{product['handle']}",
                    }
                )

        written = self._deps.cache.upsert_variants(
            rows, now=datetime.now(UTC).replace(tzinfo=None)
        )
        activity.logger.info("synced page %s: %s variants", page, written)
        return written

    @activity.defn(name=Activity.BUILD_CART_URL)
    async def build_cart_url(self, lines: list[tuple[str, int]]) -> str:
        """Shopify cart permalink from *cached variant ids*, never from model output."""
        rows = self._deps.cache.require_fresh(
            [h for h, _ in lines],
            now=datetime.now(UTC).replace(tzinfo=None),
            max_age=timedelta(hours=1),
        )
        parts = [f"{rows[h].variant_id}:{q}" for h, q in lines if h in rows]
        if not parts:
            return f"https://{_store_domain()}"
        return f"https://{_store_domain()}/cart/{','.join(parts)}"


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _store_domain() -> str:
    import os
    import re

    raw = os.environ.get("SHOPIFY_STORE_DOMAIN", "")
    cleaned = re.sub(r"^https?://", "", raw).rstrip("/")
    return cleaned if "." in cleaned else "multirotors.store"


def _strip_html(html: str) -> str:
    import re

    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()[:400]
