import { z } from "zod/v4";
import { CatalogComponent } from "./catalog";
import { BomLine, CommerceQuote } from "./commerce";
import { CompatibilityFinding, EngineeringAssessment } from "./engineering";
import { ComponentHandle, ConfigurationId, Money } from "./primitives";
import { MissionProfile, ViewKind } from "./proposal";
import { COMPONENT_TYPES } from "./registry";

/**
 * THE RENDERER CONTRACT.
 *
 * A hydrated manifest: every slot carries fully-resolved props sourced from
 * Shopify and Neo4j. The React renderer switches on `type` and hands `props`
 * to the matching component. It performs no fetching, no arithmetic, and no
 * price formatting beyond locale display.
 */

// ---------------------------------------------------------------------------
// Per-component props
// ---------------------------------------------------------------------------

const slot = <T extends (typeof COMPONENT_TYPES)[number], P extends z.ZodRawShape>(
  type: T,
  props: P,
) =>
  z
    .object({
      type: z.literal(type),
      emphasis: z.enum(["primary", "default", "muted"]).default("default"),
      props: z.object(props).strict(),
    })
    .strict();

const MissionSummarySlot = slot("mission_summary", {
  mission: MissionProfile,
  headline: z.string().max(160),
  /** Constraint chips: "under $7,000", "GPS-denied", "≥25 min". */
  constraints: z.array(z.object({ label: z.string(), satisfied: z.boolean() }).strict()).default([]),
});

const ConfigurationDiagramSlot = slot("configuration_diagram", {
  configurationId: ConfigurationId,
  nodes: z
    .array(
      z
        .object({
          handle: ComponentHandle,
          title: z.string(),
          kind: z.string(),
          slotLabel: z.string(),
        })
        .strict(),
    )
    .min(1),
  edges: z
    .array(z.object({ from: ComponentHandle, to: ComponentHandle, label: z.string() }).strict())
    .default([]),
});

const ProductCardSlot = slot("product_card", {
  component: CatalogComponent,
  /** Model prose. Rendered in a visually distinct "why we picked this" area. */
  rationale: z.string().max(400).default(""),
  addable: z.boolean(),
});

const ProductGridSlot = slot("product_grid", {
  title: z.string(),
  items: z
    .array(
      z
        .object({
          component: CatalogComponent,
          compatible: z.boolean(),
          compatibilityNote: z.string().default(""),
        })
        .strict(),
    )
    .default([]),
  /** Honest empty state instead of the model inventing products. */
  emptyMessage: z.string().default("No compatible options found in the current catalog."),
});

const ComparisonTableSlot = slot("comparison_table", {
  subjects: z.array(CatalogComponent).min(2).max(4),
  rows: z
    .array(
      z
        .object({
          axis: z.string(),
          label: z.string(),
          unit: z.string().nullable().default(null),
          cells: z
            .array(
              z
                .object({
                  handle: ComponentHandle,
                  display: z.string(),
                  /** Deterministic ranking within the row. */
                  rank: z.enum(["best", "good", "adequate", "poor", "unknown"]),
                })
                .strict(),
            )
            .min(2),
        })
        .strict(),
    )
    .min(1),
  recommendedHandle: ComponentHandle.nullable().default(null),
  recommendationRationale: z.string().max(400).default(""),
});

const CompatibilityReportSlot = slot("compatibility_report", {
  status: EngineeringAssessment.shape.status,
  confidence: z.number().min(0).max(1),
  findings: z.array(CompatibilityFinding).default([]),
  mass: EngineeringAssessment.shape.mass,
  power: EngineeringAssessment.shape.power,
  rulesetVersion: z.string(),
});

const BomTableSlot = slot("bom_table", {
  lines: z.array(BomLine).min(1),
  subtotal: Money,
  maxLeadTimeDays: z.number().int().nonnegative().nullable().default(null),
});

const PriceSummarySlot = slot("price_summary", {
  subtotal: Money,
  estimatedTax: Money.nullable().default(null),
  estimatedShipping: Money.nullable().default(null),
  total: Money,
  pricedAt: z.string().datetime(),
  /** Shown verbatim; keeps us honest about what is not yet final. */
  disclaimer: z.string().default("Tax and shipping are calculated at checkout."),
});

const AlternativesSlot = slot("alternatives", {
  title: z.string().default("Alternatives considered"),
  items: z
    .array(
      z
        .object({
          component: CatalogComponent,
          /** Signed delta vs the selected option. Server-computed. */
          priceDelta: Money,
          tradeoff: z.string().max(300),
        })
        .strict(),
    )
    .default([]),
});

const TechnicalSpecsSlot = slot("technical_specs", {
  handle: ComponentHandle,
  title: z.string(),
  groups: z
    .array(
      z
        .object({
          label: z.string(),
          rows: z
            .array(z.object({ label: z.string(), value: z.string(), unit: z.string().nullable() }).strict())
            .min(1),
        })
        .strict(),
    )
    .min(1),
});

const WarningBannerSlot = slot("warning_banner", {
  severity: z.enum(["blocker", "warning", "info"]),
  title: z.string().max(120),
  detail: z.string().max(600),
  ruleId: z.string().nullable().default(null),
});

const CheckoutCtaSlot = slot("checkout_cta", {
  configurationId: ConfigurationId,
  total: Money,
  enabled: z.boolean(),
  /** Populated when enabled is false — never a vague greyed-out button. */
  disabledReason: z.string().nullable().default(null),
  lineCount: z.number().int().positive(),
});

const ExplainerSlot = slot("explainer", {
  title: z.string().max(160),
  /** Model prose, explicitly marked as such in the UI. */
  body: z.string().max(4000),
  relatedHandles: z.array(ComponentHandle).max(6).default([]),
});

export const ManifestSlot = z.discriminatedUnion("type", [
  MissionSummarySlot,
  ConfigurationDiagramSlot,
  ProductCardSlot,
  ProductGridSlot,
  ComparisonTableSlot,
  CompatibilityReportSlot,
  BomTableSlot,
  PriceSummarySlot,
  AlternativesSlot,
  TechnicalSpecsSlot,
  WarningBannerSlot,
  CheckoutCtaSlot,
  ExplainerSlot,
]);
export type ManifestSlot = z.infer<typeof ManifestSlot>;

// ---------------------------------------------------------------------------
// The manifest and the state behind it
// ---------------------------------------------------------------------------

export const UIManifest = z
  .object({
    view: ViewKind,
    slots: z.array(ManifestSlot).min(1).max(12),
  })
  .strict();
export type UIManifest = z.infer<typeof UIManifest>;

/**
 * The durable configuration record. Persisted in Postgres, keyed by
 * ConfigurationId, and referenced by the Temporal workflow so a session can be
 * resumed on another device or three days later.
 */
export const ResolvedConfiguration = z
  .object({
    id: ConfigurationId,
    mission: MissionProfile,
    components: z.array(CatalogComponent).min(1),
    engineering: EngineeringAssessment,
    commerce: CommerceQuote,
    /** Monotonic; used for optimistic concurrency against the workflow. */
    revision: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ResolvedConfiguration = z.infer<typeof ResolvedConfiguration>;
