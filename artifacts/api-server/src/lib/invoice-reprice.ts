/**
 * Server-side repricing of the AI-generated invoice.
 *
 * The drone agent's `generateProFormaInvoice` tool returns the model's own
 * numbers verbatim (`executeTool` does `return args`), and `calculateQuoteMetadata`
 * sums prices the model supplied rather than prices Shopify supplied. So every
 * figure the customer currently sees is model output that merely happens to be
 * a valid `z.number()`.
 *
 * This module closes that gap: it takes the model's invoice, replaces the price
 * of every in-store line with the authoritative Shopify price for that variant,
 * recomputes all totals in integer cents, and reports what it had to correct.
 *
 * Design notes:
 *  - Money is integer cents throughout. `subtotal * 0.085` on floats is how you
 *    end up with 6430.000000000001 in a customer-facing quote.
 *  - Store and external items are totalled SEPARATELY, because only store items
 *    reach the Shopify cart (`createShopifyDraftOrder` drops the rest). The
 *    checkout button must show what the cart will actually charge.
 *  - A store line whose variant is no longer purchasable is marked, not dropped
 *    silently.
 */
import { logger } from "./logger";
import type { Invoice, InvoiceItem } from "@workspace/api-zod";

// ─── Money: integer cents ─────────────────────────────────────────────────────

/** Shopify's public API returns prices as decimal strings ("1299.00"). */
export function centsFromShopify(price: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(price.trim());
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = (m[2] ?? "").padEnd(2, "0");
  return whole * 100 + Number(frac);
}

/** The model gives us dollars as a float; round once, at the boundary. */
export const centsFromDollars = (n: number): number => Math.round(n * 100);
export const dollarsFromCents = (c: number): number => c / 100;

// ─── Variant price index (TTL-cached) ─────────────────────────────────────────

interface VariantFacts {
  priceCents: number;
  available: boolean;
  title: string;
  handle: string;
}

interface RestVariantLite {
  id: number;
  price: string;
  available: boolean;
}
interface RestProductLite {
  title: string;
  handle: string;
  variants: RestVariantLite[];
}

const INDEX_TTL_MS = 5 * 60 * 1000;
const MAX_PAGES = 6; // 250/page — covers ~1500 products

let cache: { at: number; index: Map<string, VariantFacts> } | null = null;
let inflight: Promise<Map<string, VariantFacts>> | null = null;

function storeDomain(): string {
  const raw = process.env.SHOPIFY_STORE_DOMAIN ?? "";
  const cleaned = raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return cleaned.includes(".") ? cleaned : "multirotors.store";
}

async function buildIndex(): Promise<Map<string, VariantFacts>> {
  const domain = storeDomain();
  const index = new Map<string, VariantFacts>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    let products: RestProductLite[] = [];
    try {
      const res = await fetch(`https://${domain}/products.json?limit=250&page=${page}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) break;
      products = ((await res.json()) as { products?: RestProductLite[] }).products ?? [];
    } catch (err) {
      logger.error({ err, page }, "variant index page fetch failed");
      break;
    }
    if (products.length === 0) break;

    for (const p of products) {
      for (const v of p.variants ?? []) {
        const priceCents = centsFromShopify(v.price);
        if (priceCents === null) continue;
        index.set(String(v.id), {
          priceCents,
          available: v.available,
          title: p.title,
          handle: p.handle,
        });
      }
    }
  }

  logger.info({ variants: index.size }, "built Shopify variant price index");
  return index;
}

/** Cached, single-flight. Also usable to back product search, which currently refetches 500 products per call. */
export async function getVariantIndex(force = false): Promise<Map<string, VariantFacts>> {
  const fresh = cache && Date.now() - cache.at < INDEX_TTL_MS;
  if (!force && fresh) return cache!.index;
  if (inflight) return inflight;

  inflight = buildIndex()
    .then((index) => {
      cache = { at: Date.now(), index };
      return index;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

// ─── Repricing ────────────────────────────────────────────────────────────────

export type LineStatus =
  | "verified" // Shopify price matched the model's claim
  | "corrected" // Shopify price differed; we used Shopify's
  | "unavailable" // variant exists but is not purchasable
  | "unknown_variant" // store item whose variantId is not in the catalog
  | "external"; // not a store item; price is an unverified market estimate

export interface RepricedLine {
  item: InvoiceItem;
  status: LineStatus;
  /** Authoritative unit price in cents for store lines; model estimate for external. */
  unitPriceCents: number;
  lineTotalCents: number;
  /** Set when status is "corrected": what the model had claimed. */
  claimedUnitPriceCents?: number;
}

export interface RepricedInvoice {
  lines: RepricedLine[];
  /** Cents. Store items only — this is what the Shopify cart will contain. */
  storeSubtotalCents: number;
  storeTaxCents: number;
  storeShippingCents: number;
  /** What the checkout button should display. */
  storeTotalCents: number;
  /** Cents. External items — quoted, but NOT purchasable through us. */
  externalSubtotalCents: number;
  /** Combined figure, clearly separable from the purchasable total. */
  grandTotalCents: number;
  currency: string;
  /** True when any store line was corrected, unavailable, or unknown. */
  diverged: boolean;
  corrections: string[];
  /** Every store line is purchasable — gates the checkout CTA. */
  purchasable: boolean;
}

const TAX_RATE_BPS = 850; // 8.5%, expressed in basis points to stay in integers
const FREE_SHIPPING_THRESHOLD_CENTS = 50_000;
const FLAT_SHIPPING_CENTS = 2_500;

/**
 * Replaces model-claimed prices with Shopify truth and recomputes every total.
 *
 * Tax and shipping are applied to the STORE subtotal only. The previous
 * behaviour taxed the combined store+external subtotal and then displayed that
 * tax against a store-only cart, which overstates the checkout figure whenever
 * an external item is present.
 */
export async function repriceInvoice(invoice: Invoice): Promise<RepricedInvoice> {
  const index = await getVariantIndex();
  const lines: RepricedLine[] = [];
  const corrections: string[] = [];

  for (const item of invoice.items) {
    const qty = Math.max(1, Math.trunc(item.quantity));

    if (item.source !== "store") {
      const cents = centsFromDollars(item.price);
      lines.push({
        item,
        status: "external",
        unitPriceCents: cents,
        lineTotalCents: cents * qty,
      });
      continue;
    }

    const facts = item.variantId ? index.get(item.variantId.split("/").pop() ?? "") : undefined;

    if (!facts) {
      const cents = centsFromDollars(item.price);
      corrections.push(`"${item.title}" is listed as an in-store item but its variant is not in the catalog.`);
      lines.push({ item, status: "unknown_variant", unitPriceCents: cents, lineTotalCents: cents * qty });
      continue;
    }

    const claimed = centsFromDollars(item.price);
    const status: LineStatus = !facts.available
      ? "unavailable"
      : facts.priceCents === claimed
        ? "verified"
        : "corrected";

    if (status === "corrected") {
      corrections.push(
        `"${item.title}": quoted ${fmt(claimed)}, actual Shopify price ${fmt(facts.priceCents)}.`,
      );
    }
    if (status === "unavailable") {
      corrections.push(`"${item.title}" is not currently purchasable.`);
    }

    lines.push({
      item,
      status,
      unitPriceCents: facts.priceCents,
      lineTotalCents: facts.priceCents * qty,
      ...(status === "corrected" ? { claimedUnitPriceCents: claimed } : {}),
    });
  }

  const storeLines = lines.filter((l) => l.status !== "external");
  const externalLines = lines.filter((l) => l.status === "external");

  const storeSubtotalCents = storeLines.reduce((s, l) => s + l.lineTotalCents, 0);
  const externalSubtotalCents = externalLines.reduce((s, l) => s + l.lineTotalCents, 0);

  const storeTaxCents = Math.round((storeSubtotalCents * TAX_RATE_BPS) / 10_000);
  const storeShippingCents =
    storeSubtotalCents === 0 || storeSubtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS
      ? 0
      : FLAT_SHIPPING_CENTS;
  const storeTotalCents = storeSubtotalCents + storeTaxCents + storeShippingCents;

  const diverged = storeLines.some((l) => l.status !== "verified");
  const purchasable =
    storeLines.length > 0 && storeLines.every((l) => l.status === "verified" || l.status === "corrected");

  if (diverged) {
    logger.warn({ corrections }, "AI invoice diverged from Shopify catalog; served corrected prices");
  }

  return {
    lines,
    storeSubtotalCents,
    storeTaxCents,
    storeShippingCents,
    storeTotalCents,
    externalSubtotalCents,
    grandTotalCents: storeTotalCents + externalSubtotalCents,
    currency: "USD",
    diverged,
    corrections,
    purchasable,
  };
}

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/**
 * Projects back onto the existing `Invoice` shape so the current UI keeps
 * working unchanged. Use this until the composable manifest lands.
 */
export function toLegacyInvoice(r: RepricedInvoice, original: Invoice): Invoice {
  return {
    ...original,
    items: r.lines.map((l) => ({ ...l.item, price: dollarsFromCents(l.unitPriceCents) })),
    subtotal: dollarsFromCents(r.storeSubtotalCents + r.externalSubtotalCents),
    tax: dollarsFromCents(r.storeTaxCents),
    shipping: dollarsFromCents(r.storeShippingCents),
    total: dollarsFromCents(r.grandTotalCents),
    currency: r.currency,
  };
}
