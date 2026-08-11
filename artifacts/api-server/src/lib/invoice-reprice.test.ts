import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  centsFromShopify,
  getVariantIndex,
  repriceInvoice,
  toLegacyInvoice,
} from "./invoice-reprice";
import type { Invoice } from "@workspace/api-zod";

/** Two real-shaped products: variant 111 at $1,299.00, variant 222 sold out. */
const CATALOG = {
  products: [
    { title: "VOXL 2", handle: "voxl-2", variants: [{ id: 111, price: "1299.00", available: true }] },
    { title: "Ouster OS1", handle: "os1", variants: [{ id: 222, price: "8500.00", available: false }] },
  ],
};

beforeEach(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("page=1")
        ? { ok: true, json: async () => CATALOG }
        : { ok: true, json: async () => ({ products: [] }) },
    ),
  );
  await getVariantIndex(true); // rebuild against the stub
});

const invoice = (items: Invoice["items"]): Invoice => ({
  items,
  subtotal: 0,
  tax: 0,
  shipping: 0,
  total: 0,
  estimatedDeliveryDays: 4,
  currency: "USD",
});

describe("money parsing", () => {
  it("parses Shopify decimal strings without float drift", () => {
    expect(centsFromShopify("1299.00")).toBe(129900);
    expect(centsFromShopify("1299.9")).toBe(129990);
    expect(centsFromShopify("1299")).toBe(129900);
    expect(centsFromShopify("bogus")).toBeNull();
  });
});

describe("repricing against Shopify truth", () => {
  it("overrides a hallucinated price with the catalog price", async () => {
    const r = await repriceInvoice(
      invoice([{ title: "VOXL 2", price: 499, quantity: 1, source: "store", variantId: "111" }]),
    );
    expect(r.lines[0].status).toBe("corrected");
    expect(r.lines[0].unitPriceCents).toBe(129900);
    expect(r.lines[0].claimedUnitPriceCents).toBe(49900);
    expect(r.diverged).toBe(true);
    expect(r.corrections[0]).toContain("$1,299.00");
  });

  it("marks a correct quote as verified and does not diverge", async () => {
    const r = await repriceInvoice(
      invoice([{ title: "VOXL 2", price: 1299, quantity: 2, source: "store", variantId: "111" }]),
    );
    expect(r.lines[0].status).toBe("verified");
    expect(r.storeSubtotalCents).toBe(259800);
    expect(r.diverged).toBe(false);
  });

  it("flags an unpurchasable variant instead of quoting it", async () => {
    const r = await repriceInvoice(
      invoice([{ title: "Ouster OS1", price: 8500, quantity: 1, source: "store", variantId: "222" }]),
    );
    expect(r.lines[0].status).toBe("unavailable");
    expect(r.purchasable).toBe(false);
  });

  it("flags an in-store item whose variant does not exist", async () => {
    const r = await repriceInvoice(
      invoice([{ title: "Ghost Drone", price: 999, quantity: 1, source: "store", variantId: "999" }]),
    );
    expect(r.lines[0].status).toBe("unknown_variant");
    expect(r.purchasable).toBe(false);
  });

  it("accepts Shopify GID form for variantId", async () => {
    const r = await repriceInvoice(
      invoice([
        {
          title: "VOXL 2",
          price: 1299,
          quantity: 1,
          source: "store",
          variantId: "gid://shopify/ProductVariant/111",
        },
      ]),
    );
    expect(r.lines[0].status).toBe("verified");
  });
});

describe("store vs external separation", () => {
  const mixed = invoice([
    { title: "VOXL 2", price: 1299, quantity: 1, source: "store", variantId: "111" },
    { title: "Orqa Goggles", price: 600, quantity: 1, source: "external" },
  ]);

  it("taxes only the store subtotal, not the external estimate", async () => {
    const r = await repriceInvoice(mixed);
    expect(r.storeSubtotalCents).toBe(129900);
    expect(r.externalSubtotalCents).toBe(60000);
    // 8.5% of 1299.00 = 110.415 -> 110.42, NOT 8.5% of 1899.00 (161.42)
    expect(r.storeTaxCents).toBe(11042);
    expect(r.storeShippingCents).toBe(0); // over the $500 free-shipping threshold
    expect(r.storeTotalCents).toBe(140942);
  });

  it("checkout total covers only what the Shopify cart will contain", async () => {
    const r = await repriceInvoice(mixed);
    expect(r.storeTotalCents).toBeLessThan(r.grandTotalCents);
    expect(r.grandTotalCents).toBe(r.storeTotalCents + r.externalSubtotalCents);
  });

  it("charges flat shipping under the threshold", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("page=1")
          ? {
              ok: true,
              json: async () => ({
                products: [
                  { title: "Prop Set", handle: "props", variants: [{ id: 333, price: "40.00", available: true }] },
                ],
              }),
            }
          : { ok: true, json: async () => ({ products: [] }) },
      ),
    );
    await getVariantIndex(true);
    const r = await repriceInvoice(
      invoice([{ title: "Prop Set", price: 40, quantity: 1, source: "store", variantId: "333" }]),
    );
    expect(r.storeShippingCents).toBe(2500);
    expect(r.storeTotalCents).toBe(4000 + 340 + 2500);
  });
});

describe("legacy projection", () => {
  it("keeps the existing Invoice shape so the current UI is unchanged", async () => {
    const original = invoice([
      { title: "VOXL 2", price: 499, quantity: 1, source: "store", variantId: "111" },
    ]);
    const legacy = toLegacyInvoice(await repriceInvoice(original), original);
    expect(legacy.items[0].price).toBe(1299);
    expect(legacy.subtotal).toBe(1299);
    expect(legacy.tax).toBe(110.42);
    expect(legacy.estimatedDeliveryDays).toBe(4);
  });
});

// ─── safeReprice: the route-facing contract ───────────────────────────────────

describe("safeReprice", () => {
  it("reports verified when the model's prices were already right", async () => {
    const { safeReprice } = await import("../src/invoice-reprice");
    const out = await safeReprice(
      invoice([{ title: "VOXL 2", price: 1299, quantity: 1, source: "store", variantId: "111" }]),
    );
    expect(out.status).toBe("verified");
    expect(out.invoice?.items[0].price).toBe(1299);
  });

  it("reports corrected and returns Shopify's price, not the model's", async () => {
    const { safeReprice } = await import("../src/invoice-reprice");
    const out = await safeReprice(
      invoice([{ title: "VOXL 2", price: 499, quantity: 1, source: "store", variantId: "111" }]),
    );
    expect(out.status).toBe("corrected");
    if (out.status !== "corrected") throw new Error("unreachable");
    expect(out.invoice.items[0].price).toBe(1299);
    expect(out.corrections[0]).toContain("$1,299.00");
  });

  it("withholds prices entirely when Shopify is unreachable", async () => {
    const { resetVariantIndex, safeReprice } = await import("../src/invoice-reprice");
    resetVariantIndex();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));

    const out = await safeReprice(
      invoice([{ title: "VOXL 2", price: 499, quantity: 1, source: "store", variantId: "111" }]),
    );
    // The critical assertion: no fallback to the model's number.
    expect(out.status).toBe("unverified");
    expect(out.invoice).toBeNull();
  });

  it("never throws — the route must always be able to reply", async () => {
    const { resetVariantIndex, safeReprice } = await import("../src/invoice-reprice");
    resetVariantIndex();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    await expect(
      safeReprice(invoice([{ title: "X", price: 1, quantity: 1, source: "store", variantId: "111" }])),
    ).resolves.toBeDefined();
  });

  it("withholds the quote when a store item is not in the catalog", async () => {
    const { safeReprice } = await import("../src/invoice-reprice");
    const out = await safeReprice(
      invoice([{ title: "Ghost Drone", price: 999, quantity: 1, source: "store", variantId: "999" }]),
    );
    // Refusing to quote beats quoting around a component we cannot name.
    expect(out.status).toBe("unverified");
    expect(out.invoice).toBeNull();
  });
});

describe("cache resilience", () => {
  it("keeps serving the last good index when a forced refresh fails", async () => {
    const { getVariantIndex, repriceInvoice } = await import("../src/invoice-reprice");
    // beforeEach built a good index. Now Shopify goes away.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    await expect(getVariantIndex(true)).rejects.toThrow();

    // A transient blip must not invalidate prices fetched ninety seconds ago.
    const r = await repriceInvoice(
      invoice([{ title: "VOXL 2", price: 499, quantity: 1, source: "store", variantId: "111" }]),
    );
    expect(r.lines[0].unitPriceCents).toBe(129900);
  });
});
