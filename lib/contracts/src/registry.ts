import { z } from "zod/v4";

/**
 * THE COMPONENT REGISTRY.
 *
 * The closed set of UI primitives the assistant may compose with. The model
 * selects from this list; it cannot invent a component, and it cannot ship
 * arbitrary markup. Adding a component here is a deliberate engineering act
 * that pairs a name with a props schema (see manifest.ts) and a React
 * implementation in the frontend registry.
 *
 * Invariant enforced by test: this tuple, the props union in manifest.ts, and
 * the frontend's exported registry keys are exactly the same set.
 */
export const COMPONENT_TYPES = [
  "mission_summary",
  "configuration_diagram",
  "product_card",
  "product_grid",
  "comparison_table",
  "compatibility_report",
  "bom_table",
  "price_summary",
  "alternatives",
  "technical_specs",
  "warning_banner",
  "checkout_cta",
  "explainer",
] as const;

export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const COMPONENT_TYPE = z.enum(COMPONENT_TYPES);

/**
 * Which components are legal in which view. A model asking for a `checkout_cta`
 * inside an `explanation` view is a validation failure, not a rendering choice —
 * this is how you stop the assistant from nudging a purchase mid-explanation.
 */
export const VIEW_ALLOWED_COMPONENTS: Record<string, readonly ComponentType[]> = {
  configuration: [
    "mission_summary",
    "configuration_diagram",
    "compatibility_report",
    "bom_table",
    "price_summary",
    "alternatives",
    "technical_specs",
    "warning_banner",
    "checkout_cta",
    "product_card",
  ],
  comparison: ["mission_summary", "comparison_table", "technical_specs", "warning_banner", "alternatives"],
  collection: ["mission_summary", "product_grid", "product_card", "warning_banner"],
  explanation: ["explainer", "technical_specs", "warning_banner"],
  checkout: ["bom_table", "price_summary", "warning_banner", "checkout_cta"],
};

/**
 * Components that must never render model-sourced data. Used by the trust-boundary
 * assertion in hydrate.ts.
 */
export const AUTHORITATIVE_ONLY_COMPONENTS: readonly ComponentType[] = [
  "price_summary",
  "bom_table",
  "checkout_cta",
  "compatibility_report",
  "product_card",
  "product_grid",
  "comparison_table",
];

export const isComponentType = (v: unknown): v is ComponentType =>
  typeof v === "string" && (COMPONENT_TYPES as readonly string[]).includes(v);
