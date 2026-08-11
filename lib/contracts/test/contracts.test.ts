import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import {
  ComponentHandle,
  COMPONENT_TYPES,
  CommerceQuote,
  ContractViolation,
  ManifestSlot,
  UIManifest,
  addMoney,
  assertAllHandlesResolved,
  assertProposalCarriesNoFacts,
  degradedManifest,
  formatMoney,
  money,
  parseProposal,
  sumMoney,
  type ComponentType,
} from "../src/index";

const handle = (s: string) => ComponentHandle.parse(s);

const baseProposal = {
  intent: "configure_system",
  view: "configuration",
  message: "Here's a thermal inspection build under $7,000.",
  slots: [
    { type: "mission_summary", emphasis: "primary" },
    { type: "bom_table", emphasis: "default" },
    { type: "price_summary", emphasis: "default" },
    { type: "checkout_cta", emphasis: "primary" },
  ],
  configuration: {
    baseConfigurationId: null,
    mission: "thermal_inspection",
    constraints: {
      budgetMaxMinor: 700000,
      minFlightMinutes: 25,
      requiredModalities: ["thermal"],
      requiredAutonomy: ["vio"],
      maxTakeoffMassG: null,
      indoorOperation: null,
      notes: "GPS-denied capability required",
    },
    selections: [
      { handle: "mr-x10", kind: "platform", quantity: 1, rationale: "Payload headroom for thermal." },
      { handle: "voxl2", kind: "compute", quantity: 1, rationale: "Onboard VIO for GPS-denied flight." },
    ],
    alternates: [],
  },
  comparison: null,
  collection: null,
  suggestedFollowUps: ["Compare VOXL2 and Jetson", "Show me compatible LiDARs"],
};

// ---------------------------------------------------------------------------

describe("registry / manifest parity", () => {
  it("every registered component name has exactly one props schema", () => {
    const unionTypes = ManifestSlot.options.map(
      (o) => (o as z.ZodObject<{ type: z.ZodLiteral<ComponentType> }>).shape.type.value,
    );
    expect([...unionTypes].sort()).toEqual([...COMPONENT_TYPES].sort());
  });

  it("has no duplicate component names", () => {
    expect(new Set(COMPONENT_TYPES).size).toBe(COMPONENT_TYPES.length);
  });
});

describe("proposal validation", () => {
  it("accepts a well-formed configuration proposal", () => {
    const r = parseProposal(baseProposal);
    expect(r.ok).toBe(true);
  });

  it("rejects an unregistered UI component", () => {
    const r = parseProposal({
      ...baseProposal,
      slots: [{ type: "flashy_upsell_banner", emphasis: "primary" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["schema_invalid", "unknown_component_type"]).toContain(r.violation.code);
  });

  it("rejects a checkout CTA smuggled into an explanation view", () => {
    const r = parseProposal({
      ...baseProposal,
      view: "explanation",
      configuration: null,
      slots: [{ type: "explainer", emphasis: "default" }, { type: "checkout_cta", emphasis: "primary" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violation.code).toBe("component_not_allowed_in_view");
  });

  it("rejects a configuration view with no configuration payload", () => {
    const r = parseProposal({ ...baseProposal, configuration: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violation.code).toBe("schema_invalid");
  });

  it("strips nothing silently — unknown keys are a hard failure", () => {
    const r = parseProposal({ ...baseProposal, price: 6430 });
    expect(r.ok).toBe(false);
  });
});

describe("trust boundary", () => {
  it("refuses any model payload carrying a price", () => {
    expect(() =>
      assertProposalCarriesNoFacts({ configuration: { selections: [{ handle: "voxl2", price: 129900 }] } }),
    ).toThrowError(ContractViolation);
  });

  it("refuses a model-supplied compatibility verdict", () => {
    expect(() => assertProposalCarriesNoFacts({ engineering: { compatibility: 0.94 } })).toThrowError(
      /authoritative field/,
    );
  });

  it("refuses a model-supplied SKU", () => {
    expect(() => assertProposalCarriesNoFacts({ a: [{ b: { sku: "MR-X10-001" } }] })).toThrowError(
      ContractViolation,
    );
  });

  it("allows handles, rationale, and prose", () => {
    expect(() =>
      assertProposalCarriesNoFacts({ handle: "voxl2", rationale: "good VIO", message: "hello" }),
    ).not.toThrow();
  });

  it("rejects handles absent from the catalog rather than dropping them", () => {
    expect(() => assertAllHandlesResolved([handle("voxl2"), handle("ghost-part")], new Map())).toThrowError(
      /absent from the catalog/,
    );
  });
});

describe("money", () => {
  it("refuses non-integer minor units", () => {
    expect(() => money(6430.5)).toThrowError(TypeError);
  });

  it("adds and formats without float drift", () => {
    const total = sumMoney([money(643000), money(49900), money(119900)]);
    expect(total.amount).toBe(812800);
    expect(formatMoney(total)).toBe("$8,128.00");
  });

  it("refuses cross-currency addition", () => {
    expect(() => addMoney(money(100, "USD"), money(100, "EUR"))).toThrowError(/cannot add/);
  });
});

describe("commerce quote invariants", () => {
  const line = {
    handle: "voxl2",
    variantId: "gid://shopify/ProductVariant/44120983",
    sku: "VOXL2-001",
    title: "VOXL 2",
    quantity: 1,
    unitPrice: money(129900),
    lineTotal: money(129900),
    inventory: "in_stock",
    availableForSale: true,
    leadTimeDays: 5,
    rationale: "",
  };

  it("rejects a total below subtotal", () => {
    const r = CommerceQuote.safeParse({
      lines: [line],
      subtotal: money(129900),
      total: money(99900),
      currency: "USD",
      purchasable: true,
      pricedAt: new Date().toISOString(),
    });
    expect(r.success).toBe(false);
  });

  it("rejects purchasable:true when a line is unavailable", () => {
    const r = CommerceQuote.safeParse({
      lines: [{ ...line, availableForSale: false }],
      subtotal: money(129900),
      total: money(129900),
      currency: "USD",
      purchasable: true,
      pricedAt: new Date().toISOString(),
    });
    expect(r.success).toBe(false);
  });

  it("accepts a consistent quote", () => {
    const r = CommerceQuote.safeParse({
      lines: [line],
      subtotal: money(129900),
      total: money(129900),
      currency: "USD",
      purchasable: true,
      pricedAt: new Date().toISOString(),
    });
    expect(r.success).toBe(true);
  });
});

describe("degraded path", () => {
  it("produces a renderable manifest rather than a blank screen", () => {
    const m = degradedManifest("model returned an unknown component handle");
    expect(UIManifest.safeParse(m).success).toBe(true);
    expect(m.slots[0]?.type).toBe("explainer");
  });
});
