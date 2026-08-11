import { describe, it, expect } from "vitest";
import { extractInvoice } from "./invoice-extractor";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wrapInvoice(json: unknown): string {
  return `Some assistant text.\n__INVOICE__\n${JSON.stringify(json)}\n__INVOICE__`;
}

const validInvoice = {
  items: [
    {
      title: "DJI Mini 4 Pro",
      price: 759.0,
      quantity: 1,
      source: "store",
      variantId: "gid://shopify/ProductVariant/123",
    },
  ],
  subtotal: 759.0,
  tax: 60.72,
  shipping: 0,
  total: 819.72,
  estimatedDeliveryDays: 3,
  currency: "USD",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("extractInvoice — valid payloads", () => {
  it("parses and returns a well-formed invoice", () => {
    const raw = wrapInvoice(validInvoice);
    const { invoice, text } = extractInvoice(raw);
    expect(invoice).not.toBeNull();
    expect(invoice!.items).toHaveLength(1);
    expect(invoice!.total).toBe(819.72);
    expect(text).toBe("Some assistant text.");
  });

  it("returns null invoice when no __INVOICE__ block is present", () => {
    const { invoice, text } = extractInvoice("Just a helpful reply.");
    expect(invoice).toBeNull();
    expect(text).toBe("Just a helpful reply.");
  });
});

describe("extractInvoice — malformed payloads (server-side rejection)", () => {
  it("discards invoice when items array is empty", () => {
    const { invoice } = extractInvoice(wrapInvoice({ ...validInvoice, items: [] }));
    expect(invoice).toBeNull();
  });

  it("discards invoice when items is missing", () => {
    const { invoice } = extractInvoice(
      wrapInvoice({ subtotal: 100, tax: 10, shipping: 0, total: 110, estimatedDeliveryDays: 3, currency: "USD" })
    );
    expect(invoice).toBeNull();
  });

  it("discards invoice when a required field (total) is missing", () => {
    const { subtotal, tax, shipping, total: _total, ...rest } = validInvoice;
    const { invoice } = extractInvoice(wrapInvoice({ subtotal, tax, shipping, ...rest }));
    expect(invoice).toBeNull();
  });

  it("discards invoice when price is a string instead of a number", () => {
    const badItems = [{ ...validInvoice.items[0], price: "free" }];
    const { invoice } = extractInvoice(wrapInvoice({ ...validInvoice, items: badItems }));
    expect(invoice).toBeNull();
  });

  it("discards invoice when source has an invalid enum value", () => {
    const badItems = [{ ...validInvoice.items[0], source: "unknown" }];
    const { invoice } = extractInvoice(wrapInvoice({ ...validInvoice, items: badItems }));
    expect(invoice).toBeNull();
  });

  it("discards invoice when JSON is syntactically invalid", () => {
    const raw = "Some text.\n__INVOICE__\n{not valid json\n__INVOICE__";
    const { invoice, text } = extractInvoice(raw);
    expect(invoice).toBeNull();
    // When JSON fails to parse we preserve the full raw text
    expect(text).toBe(raw.trim());
  });

  it("still returns the assistant text when the invoice is invalid", () => {
    const raw = wrapInvoice({ ...validInvoice, items: [] });
    const { text } = extractInvoice(raw);
    expect(text).toBe("Some assistant text.");
  });
});
