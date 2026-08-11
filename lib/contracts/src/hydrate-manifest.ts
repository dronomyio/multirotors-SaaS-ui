import {
  ContractViolation,
  type CommercePort,
  type EngineeringPort,
  type CatalogPort,
} from "./hydrate";
import type { CatalogComponent } from "./catalog";
import type { CommerceQuote } from "./commerce";
import type { EngineeringAssessment } from "./engineering";
import type { ManifestSlot, UIManifest } from "./manifest";
import { UIManifest as UIManifestSchema } from "./manifest";
import type { ComponentHandle, ConfigurationId, Money } from "./primitives";
import { money, sumMoney } from "./primitives";
import type { AssistantProposal } from "./proposal";
import type { ComponentType } from "./registry";

/**
 * THE HYDRATION STEP — where a proposal becomes a manifest.
 *
 * The model said "show a mission summary, then a BOM, then a price, then a
 * checkout button, built from these four handles." This turns that into slots
 * whose every value came from Neo4j or Shopify.
 *
 * Note what is NOT passed through from the proposal: nothing numeric. The only
 * model-authored strings that survive are `message`, `rationale`, and
 * `explainer.body`, and the UI marks all three as assistant prose.
 */

export interface HydrationInput {
  proposal: AssistantProposal;
  configurationId: ConfigurationId;
  ports: {
    catalog: CatalogPort;
    engineering: EngineeringPort;
    commerce: CommercePort;
  };
}

export async function hydrateManifest(input: HydrationInput): Promise<UIManifest> {
  const { proposal, configurationId, ports } = input;

  const selections = proposal.configuration?.selections ?? [];
  const handles = selections.map((s) => s.handle);
  const resolved = handles.length ? await ports.catalog.resolveHandles(handles) : new Map();

  const missing = handles.filter((h) => !resolved.has(h));
  if (missing.length > 0) {
    throw new ContractViolation(
      `assistant referenced ${missing.length} unknown handle(s): ${missing.join(", ")}`,
      "unknown_handle",
      { missing },
    );
  }

  const components = handles
    .map((h) => resolved.get(h))
    .filter((c): c is CatalogComponent => c !== undefined);

  const engineering = components.length ? await ports.engineering.assess(components) : null;
  // Never price a build that cannot fly — quoting it invites someone to buy it.
  const quote =
    components.length && engineering?.status !== "incompatible"
      ? await ports.commerce.quote(
          selections.map((s) => ({
            handle: s.handle,
            quantity: s.quantity,
            rationale: s.rationale,
          })),
          resolved,
        )
      : null;

  const rationaleByHandle = new Map(selections.map((s) => [s.handle, s.rationale]));

  const slots: ManifestSlot[] = [];
  for (const slot of proposal.slots) {
    const built = buildSlot(slot.type, slot.emphasis, {
      proposal,
      configurationId,
      components,
      engineering,
      quote,
      rationaleByHandle,
    });
    // A panel with nothing truthful to show is omitted, not filled with zeroes.
    if (built) slots.push(built);
  }

  if (slots.length === 0) {
    throw new ContractViolation(
      "no slot could be hydrated from authoritative data",
      "missing_payload",
      { requested: proposal.slots.map((s) => s.type) },
    );
  }

  return UIManifestSchema.parse({ view: proposal.view, slots });
}

interface BuildContext {
  proposal: AssistantProposal;
  configurationId: ConfigurationId;
  components: CatalogComponent[];
  engineering: EngineeringAssessment | null;
  quote: CommerceQuote | null;
  rationaleByHandle: Map<ComponentHandle, string>;
}

type Emphasis = "primary" | "default" | "muted";

function buildSlot(
  type: ComponentType,
  emphasis: Emphasis,
  ctx: BuildContext,
): ManifestSlot | null {
  switch (type) {
    case "mission_summary":
      return {
        type,
        emphasis,
        props: {
          mission: ctx.proposal.configuration?.mission ?? "unspecified",
          headline: ctx.proposal.message.slice(0, 160),
          constraints: buildConstraintChips(ctx),
        },
      };

    case "configuration_diagram":
      if (!ctx.components.length) return null;
      return {
        type,
        emphasis,
        props: {
          configurationId: ctx.configurationId,
          nodes: ctx.components.map((c) => ({
            handle: c.handle,
            title: c.title,
            kind: c.kind,
            slotLabel: c.kind.replace(/_/g, " "),
          })),
          edges: [],
        },
      };

    case "compatibility_report":
      if (!ctx.engineering) return null;
      return {
        type,
        emphasis,
        props: {
          status: ctx.engineering.status,
          confidence: ctx.engineering.compatibilityConfidence,
          findings: ctx.engineering.findings,
          mass: ctx.engineering.mass,
          power: ctx.engineering.power,
          rulesetVersion: ctx.engineering.rulesetVersion,
        },
      };

    case "bom_table":
      if (!ctx.quote) return null;
      return {
        type,
        emphasis,
        props: {
          lines: ctx.quote.lines,
          subtotal: ctx.quote.subtotal,
          maxLeadTimeDays: ctx.quote.maxLeadTimeDays,
        },
      };

    case "price_summary":
      if (!ctx.quote) return null;
      return {
        type,
        emphasis,
        props: {
          subtotal: ctx.quote.subtotal,
          estimatedTax: ctx.quote.estimatedTax,
          estimatedShipping: ctx.quote.estimatedShipping,
          total: ctx.quote.total,
          pricedAt: ctx.quote.pricedAt,
          disclaimer: "Tax and shipping are calculated at checkout.",
        },
      };

    case "checkout_cta": {
      if (!ctx.quote) return null;
      const reason = checkoutBlockReason(ctx);
      return {
        type,
        emphasis,
        props: {
          configurationId: ctx.configurationId,
          total: ctx.quote.total,
          enabled: reason === null,
          disabledReason: reason,
          lineCount: ctx.quote.lines.length,
        },
      };
    }

    case "product_card": {
      const first = ctx.components[0];
      if (!first) return null;
      return {
        type,
        emphasis,
        props: {
          component: first,
          rationale: ctx.rationaleByHandle.get(first.handle) ?? "",
          addable: first.commerce.availableForSale,
        },
      };
    }

    case "product_grid":
      return {
        type,
        emphasis,
        props: {
          title: "Compatible options",
          items: ctx.components.map((c) => ({
            component: c,
            compatible: ctx.engineering?.status !== "incompatible",
            compatibilityNote: "",
          })),
          emptyMessage: "No compatible options found in the current catalog.",
        },
      };

    case "comparison_table": {
      const subjects = ctx.components.slice(0, 4);
      if (subjects.length < 2) return null;
      return { type, emphasis, props: buildComparison(subjects) };
    }

    case "alternatives": {
      const alternates = ctx.proposal.configuration?.alternates ?? [];
      if (!alternates.length) return null;
      // Alternates are only renderable once resolved; a future pass resolves
      // them through the catalog port. Omitting beats inventing a price delta.
      return null;
    }

    case "technical_specs": {
      const first = ctx.components[0];
      if (!first) return null;
      return { type, emphasis, props: buildSpecs(first) };
    }

    case "warning_banner": {
      const blocker = ctx.engineering?.findings.find((f) => f.severity === "blocker");
      const warning = ctx.engineering?.findings.find((f) => f.severity === "warning");
      const finding = blocker ?? warning;
      if (!finding) return null;
      return {
        type,
        emphasis,
        props: {
          severity: finding.severity,
          title: finding.severity === "blocker" ? "This build will not fly" : "Worth knowing",
          detail: finding.message,
          ruleId: finding.ruleId,
        },
      };
    }

    case "explainer":
      return {
        type,
        emphasis,
        props: {
          title: "About this",
          body: ctx.proposal.message,
          relatedHandles: ctx.components.slice(0, 6).map((c) => c.handle),
        },
      };

    default: {
      const exhaustive: never = type;
      throw new ContractViolation(
        `no hydration branch for component "${String(exhaustive)}"`,
        "unknown_component_type",
      );
    }
  }
}

function buildConstraintChips(ctx: BuildContext): { label: string; satisfied: boolean }[] {
  const c = ctx.proposal.configuration?.constraints;
  if (!c) return [];
  const chips: { label: string; satisfied: boolean }[] = [];

  if (c.budgetMaxMinor !== null) {
    const total = ctx.quote?.total.amount ?? null;
    chips.push({
      label: `Under ${formatMinor(money(c.budgetMaxMinor))}`,
      // Unknown reads as not-yet-satisfied rather than optimistically true.
      satisfied: total !== null && total <= c.budgetMaxMinor,
    });
  }
  if (c.minFlightMinutes !== null) {
    const est = ctx.engineering?.power.estimatedFlightMinutes ?? null;
    chips.push({
      label: `≥ ${c.minFlightMinutes} min endurance`,
      satisfied: est !== null && est >= c.minFlightMinutes,
    });
  }
  for (const modality of c.requiredModalities) {
    chips.push({
      label: modality,
      satisfied: ctx.components.some((x) => x.spec.kind === "sensor" && x.spec.modality === modality),
    });
  }
  for (const capability of c.requiredAutonomy) {
    chips.push({
      label: capability,
      satisfied: ctx.components.some(
        (x) => x.spec.kind === "compute" && x.spec.supportedAutonomy.includes(capability),
      ),
    });
  }
  return chips;
}

function checkoutBlockReason(ctx: BuildContext): string | null {
  if (ctx.engineering?.status === "incompatible") {
    return "This configuration has unresolved compatibility blockers.";
  }
  if (!ctx.quote?.purchasable) {
    const unavailable = ctx.quote?.lines.filter((l) => !l.availableForSale) ?? [];
    return unavailable.length
      ? `Not currently purchasable: ${unavailable.map((l) => l.title).join(", ")}.`
      : "One or more items are not currently purchasable.";
  }
  return null;
}

const COMPARISON_AXES = [
  { axis: "massG", label: "Mass", unit: "g", lowerIsBetter: true },
  { axis: "typicalPowerW", label: "Typical power", unit: "W", lowerIsBetter: true },
  { axis: "price", label: "Price", unit: null, lowerIsBetter: true },
] as const;

function buildComparison(subjects: CatalogComponent[]) {
  const rows = COMPARISON_AXES.map((spec) => {
    const values = subjects.map((s) => ({
      handle: s.handle,
      raw: readAxis(s, spec.axis),
    }));
    const known = values.filter((v) => v.raw !== null).map((v) => v.raw as number);
    const best = known.length ? (spec.lowerIsBetter ? Math.min(...known) : Math.max(...known)) : null;

    return {
      axis: spec.axis,
      label: spec.label,
      unit: spec.unit,
      cells: values.map((v) => ({
        handle: v.handle,
        display:
          v.raw === null
            ? "unknown"
            : spec.axis === "price"
              ? formatMinor(money(v.raw))
              : `${v.raw}`,
        // "unknown" is a real rank. Guessing a rank for missing data is worse
        // than admitting the graph has no figure.
        rank: (v.raw === null ? "unknown" : v.raw === best ? "best" : "adequate") as
          | "best"
          | "adequate"
          | "unknown",
      })),
    };
  });

  return {
    subjects,
    rows,
    recommendedHandle: null,
    recommendationRationale: "",
  };
}

function readAxis(c: CatalogComponent, axis: string): number | null {
  if (axis === "price") return c.commerce.price.amount;
  const spec = c.spec as unknown as Record<string, unknown>;
  const value = spec[axis];
  return typeof value === "number" ? value : null;
}

function buildSpecs(c: CatalogComponent) {
  const spec = c.spec as unknown as Record<string, unknown>;
  const rows = Object.entries(spec)
    .filter(([key, value]) => key !== "kind" && value !== null && value !== undefined)
    .map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, " $1").replace(/^./, (m) => m.toUpperCase()),
      value: Array.isArray(value) ? value.join(", ") : String(value),
      unit: null,
    }));

  return {
    handle: c.handle,
    title: c.title,
    groups: rows.length ? [{ label: "Specifications", rows }] : [
      { label: "Specifications", rows: [{ label: "Data", value: "Not published", unit: null }] },
    ],
  };
}

const formatMinor = (m: Money): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: m.currency }).format(m.amount / 100);

export { sumMoney };
