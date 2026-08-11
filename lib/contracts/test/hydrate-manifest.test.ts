import { describe, expect, it } from "vitest";
import {
  ComponentHandle,
  ConfigurationId,
  ContractViolation,
  hydrateManifest,
  money,
  parseProposal,
  type CatalogComponent,
  type CommerceQuote,
  type EngineeringAssessment,
} from "../src/index";

const handle = (s: string) => ComponentHandle.parse(s);
const CONFIG_ID = ConfigurationId.parse("11111111-1111-4111-8111-111111111111");
const NOW = "2026-08-11T00:00:00Z";

function component(h: string, over: Partial<CatalogComponent> = {}): CatalogComponent {
  return {
    handle: handle(h),
    kind: "compute",
    title: h.toUpperCase(),
    vendor: "Test",
    summary: "",
    imageUrl: null,
    spec: {
      kind: "compute",
      massG: 16 as never,
      typicalPowerW: 8 as never,
      peakPowerW: 15 as never,
      cameraPorts: 4,
      tops: null,
      ramGb: 8,
      supportedAutonomy: ["vio"],
    },
    commerce: {
      productId: "gid://shopify/Product/1" as never,
      variantId: "gid://shopify/ProductVariant/111" as never,
      sku: "SKU-1",
      price: money(129900),
      compareAtPrice: null,
      availableForSale: true,
      inventory: "in_stock",
      quantityAvailable: 3,
      leadTimeDays: 5,
    },
    missionTags: [],
    ...over,
  } as CatalogComponent;
}

const assessment = (over: Partial<EngineeringAssessment> = {}): EngineeringAssessment =>
  ({
    status: "compatible",
    findings: [],
    mass: {
      platformDryG: 2200 as never,
      payloadG: 111 as never,
      batteryG: 1800 as never,
      totalG: 4111 as never,
      maxTakeoffG: 6000 as never,
      utilization: 0.685,
      headroomG: 1889,
    },
    power: {
      hoverW: 350 as never,
      avionicsW: 8 as never,
      payloadW: 3 as never,
      totalW: 361 as never,
      estimatedFlightMinutes: 47 as never,
      model: "linear_wh_over_w",
      confidenceMinutes: 9 as never,
    },
    compatibilityConfidence: 1,
    unverifiedPairs: [],
    computedAt: NOW,
    rulesetVersion: "2026.08.1",
    ...over,
  }) as EngineeringAssessment;

const quote = (over: Partial<CommerceQuote> = {}): CommerceQuote =>
  ({
    lines: [
      {
        handle: handle("voxl2"),
        variantId: "gid://shopify/ProductVariant/111" as never,
        sku: "SKU-1",
        title: "VOXL2",
        quantity: 1,
        unitPrice: money(129900),
        lineTotal: money(129900),
        inventory: "in_stock",
        availableForSale: true,
        leadTimeDays: 5,
        rationale: "",
      },
    ],
    subtotal: money(129900),
    estimatedTax: money(11042),
    estimatedShipping: money(0),
    total: money(140942),
    currency: "USD",
    purchasable: true,
    maxLeadTimeDays: 5,
    pricedAt: NOW,
    cartId: null,
    checkoutUrl: null,
    ...over,
  }) as CommerceQuote;

function ports(opts: { component?: CatalogComponent; eng?: EngineeringAssessment; q?: CommerceQuote; known?: boolean } = {}) {
  const c = opts.component ?? component("voxl2");
  return {
    catalog: {
      resolveHandles: async (handles: readonly ComponentHandle[]) =>
        new Map(opts.known === false ? [] : handles.map((h) => [h, { ...c, handle: h }])),
    },
    engineering: { assess: async () => opts.eng ?? assessment() },
    commerce: { quote: async () => opts.q ?? quote() },
  };
}

const proposal = (slots: string[], over: Record<string, unknown> = {}) => {
  const r = parseProposal({
    intent: "configure_system",
    view: "configuration",
    message: "Here is a thermal inspection build.",
    slots: slots.map((type) => ({ type, emphasis: "default" })),
    configuration: {
      baseConfigurationId: null,
      mission: "thermal_inspection",
      constraints: {
        budgetMaxMinor: 700000,
        minFlightMinutes: 25,
        requiredModalities: [],
        requiredAutonomy: ["vio"],
        maxTakeoffMassG: null,
        indoorOperation: null,
        notes: "",
      },
      selections: [{ handle: "voxl2", kind: "compute", quantity: 1, rationale: "VIO onboard." }],
      alternates: [],
    },
    comparison: null,
    collection: null,
    suggestedFollowUps: [],
    ...over,
  });
  if (!r.ok) throw r.violation;
  return r.proposal;
};

describe("hydration", () => {
  it("fills slots from authoritative data, not the proposal", async () => {
    const m = await hydrateManifest({
      proposal: proposal(["mission_summary", "bom_table", "price_summary", "checkout_cta"]),
      configurationId: CONFIG_ID,
      ports: ports(),
    });

    expect(m.slots.map((s) => s.type)).toEqual([
      "mission_summary",
      "bom_table",
      "price_summary",
      "checkout_cta",
    ]);
    const price = m.slots.find((s) => s.type === "price_summary");
    expect(price?.type === "price_summary" && price.props.total.amount).toBe(140942);
  });

  it("preserves the order the model chose", async () => {
    const m = await hydrateManifest({
      proposal: proposal(["price_summary", "mission_summary", "bom_table"]),
      configurationId: CONFIG_ID,
      ports: ports(),
    });
    expect(m.slots.map((s) => s.type)).toEqual(["price_summary", "mission_summary", "bom_table"]);
  });

  it("rejects a handle the catalog does not know rather than dropping it", async () => {
    await expect(
      hydrateManifest({
        proposal: proposal(["mission_summary"]),
        configurationId: CONFIG_ID,
        ports: ports({ known: false }),
      }),
    ).rejects.toThrow(ContractViolation);
  });

  it("does not price an incompatible build", async () => {
    const m = await hydrateManifest({
      proposal: proposal(["mission_summary", "warning_banner", "bom_table", "price_summary"]),
      configurationId: CONFIG_ID,
      ports: ports({
        eng: assessment({
          status: "incompatible",
          findings: [
            {
              ruleId: "MASS.over_mtow",
              severity: "blocker",
              subjects: [handle("voxl2")],
              message: "Over maximum takeoff mass.",
              remedies: [],
            },
          ],
        }),
      }),
    });

    const types = m.slots.map((s) => s.type);
    expect(types).toContain("warning_banner");
    expect(types).not.toContain("bom_table");
    expect(types).not.toContain("price_summary");
  });

  it("disables checkout with a stated reason when a line is unavailable", async () => {
    const m = await hydrateManifest({
      proposal: proposal(["checkout_cta"]),
      configurationId: CONFIG_ID,
      ports: ports({
        q: quote({
          purchasable: false,
          lines: [{ ...quote().lines[0]!, availableForSale: false, title: "VOXL2" }],
        }),
      }),
    });

    const cta = m.slots[0];
    expect(cta?.type === "checkout_cta" && cta.props.enabled).toBe(false);
    expect(cta?.type === "checkout_cta" && cta.props.disabledReason).toContain("VOXL2");
  });

  it("marks an unmet budget constraint as unsatisfied", async () => {
    const m = await hydrateManifest({
      proposal: proposal(["mission_summary"]),
      configurationId: CONFIG_ID,
      // total 140942 > budget 700000? no — raise the total above budget
      ports: ports({ q: quote({ total: money(900000) }) }),
    });

    const summary = m.slots[0];
    if (summary?.type !== "mission_summary") throw new Error("expected mission_summary");
    const budgetChip = summary.props.constraints.find((c) => c.label.startsWith("Under"));
    expect(budgetChip?.satisfied).toBe(false);
  });

  it("omits a panel it cannot fill truthfully rather than showing zeroes", async () => {
    const m = await hydrateManifest({
      // The model asked for an alternatives panel, but proposed no alternates.
      proposal: proposal(["mission_summary", "alternatives"]),
      configurationId: CONFIG_ID,
      ports: ports(),
    });
    expect(m.slots.map((s) => s.type)).toEqual(["mission_summary"]);
  });

  it("refuses a component that is illegal for the view", async () => {
    // A comparison table has no business in a configuration view; the allowlist
    // rejects it at parse time rather than letting hydration paper over it.
    expect(() => proposal(["mission_summary", "comparison_table"])).toThrow(
      /not permitted in view "configuration"/,
    );
  });
});
