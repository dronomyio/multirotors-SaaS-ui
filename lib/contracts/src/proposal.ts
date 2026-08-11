import { z } from "zod/v4";
import { AutonomyCapability, ComponentKind, SensorModality } from "./catalog";
import { ComponentHandle, ConfigurationId } from "./primitives";
import { COMPONENT_TYPE } from "./registry";

/**
 * THE LLM SURFACE.
 *
 * This is the complete set of shapes Mastra's agent is permitted to emit.
 * Pass `AssistantProposal` to `agent.generate(..., { structuredOutput: { schema } })`.
 *
 * Deliberately absent, and never to be added:
 *   - price, currency, discount, subtotal
 *   - SKU, variant id, product id
 *   - inventory counts, lead times
 *   - compatibility verdicts or scores
 *   - payload mass, flight time, power budget
 *
 * The model selects and sequences. The server computes and prices. If you ever
 * find yourself adding a numeric business fact to this file, that is the bug.
 */

export const MissionProfile = z.enum([
  "solar_inspection",
  "thermal_inspection",
  "infrastructure_inspection",
  "mapping_survey",
  "search_and_rescue",
  "security_patrol",
  "indoor_gps_denied",
  "research_development",
  "unspecified",
]);
export type MissionProfile = z.infer<typeof MissionProfile>;

export const Intent = z.enum([
  "configure_system", // build me a drone that...
  "compare_options", // VOXL2 vs Jetson
  "browse_collection", // show me compatible lidars
  "modify_configuration", // add the second one
  "explain", // what is VIO
  "review_build", // show the complete build
  "checkout", // I'll take it
  "out_of_scope", // model could not map the request
]);
export type Intent = z.infer<typeof Intent>;

/**
 * A constraint the customer stated. The model extracts it; the server enforces
 * it. `budgetMaxMinor` is the customer's stated ceiling — an input to filtering,
 * NOT a price the UI will ever display as ours.
 */
export const ExtractedConstraints = z
  .object({
    budgetMaxMinor: z.number().int().positive().nullable().default(null),
    minFlightMinutes: z.number().int().positive().nullable().default(null),
    requiredModalities: z.array(SensorModality).default([]),
    requiredAutonomy: z.array(AutonomyCapability).default([]),
    maxTakeoffMassG: z.number().positive().nullable().default(null),
    indoorOperation: z.boolean().nullable().default(null),
    notes: z.string().max(500).default(""),
  })
  .strict();
export type ExtractedConstraints = z.infer<typeof ExtractedConstraints>;

/**
 * The model picks components BY HANDLE ONLY. Handles are validated against the
 * Neo4j graph during hydration; an unknown handle is a hard rejection, not a
 * silently dropped line item.
 */
export const ComponentSelection = z
  .object({
    handle: ComponentHandle,
    kind: ComponentKind,
    quantity: z.number().int().positive().max(16).default(1),
    /** Prose only. Rendered as the model's reasoning, never as a spec. */
    rationale: z.string().max(400).default(""),
  })
  .strict();
export type ComponentSelection = z.infer<typeof ComponentSelection>;

export const ConfigurationProposal = z
  .object({
    /** Present when modifying an existing config; null when starting fresh. */
    baseConfigurationId: ConfigurationId.nullable().default(null),
    mission: MissionProfile,
    constraints: ExtractedConstraints,
    selections: z.array(ComponentSelection).min(1).max(24),
    /** Handles the model considered and set aside, for the "alternatives" panel. */
    alternates: z.array(ComponentSelection).max(12).default([]),
  })
  .strict();
export type ConfigurationProposal = z.infer<typeof ConfigurationProposal>;

/** For "compare VOXL2 and Jetson" — the model names the subjects and the axes. */
export const ComparisonProposal = z
  .object({
    subjects: z.array(ComponentHandle).min(2).max(4),
    /** Axis keys must resolve to real spec fields during hydration. */
    axes: z
      .array(
        z.enum([
          "massG",
          "typicalPowerW",
          "peakPowerW",
          "cameraPorts",
          "tops",
          "ramGb",
          "capacityWh",
          "price",
          "availability",
        ]),
      )
      .min(1)
      .max(8),
    /** Optional editorial lean. Advisory, not a verdict the UI badges as fact. */
    recommendedHandle: ComponentHandle.nullable().default(null),
  })
  .strict();
export type ComparisonProposal = z.infer<typeof ComparisonProposal>;

/** For "show me compatible lidars" — a filter spec, not a result set. */
export const CollectionProposal = z
  .object({
    kind: ComponentKind,
    modality: SensorModality.nullable().default(null),
    /** Restrict to items compatible with this config. Server does the graph query. */
    compatibleWithConfigurationId: ConfigurationId.nullable().default(null),
    missionTags: z.array(z.string().max(40)).max(6).default([]),
    limit: z.number().int().min(1).max(24).default(12),
  })
  .strict();
export type CollectionProposal = z.infer<typeof CollectionProposal>;

// ---------------------------------------------------------------------------
// UI manifest proposal — the model picks components and order, nothing else
// ---------------------------------------------------------------------------

/**
 * Note there are NO props here. The model chooses WHICH panels appear and in
 * WHAT ORDER. Every value inside each panel is filled server-side from Shopify
 * and Neo4j. This is what makes a hallucinated $499 price structurally
 * impossible rather than merely unlikely.
 */
export const ManifestSlotProposal = z
  .object({
    type: COMPONENT_TYPE,
    /** Optional emphasis hint the renderer may honour or ignore. */
    emphasis: z.enum(["primary", "default", "muted"]).default("default"),
  })
  .strict();
export type ManifestSlotProposal = z.infer<typeof ManifestSlotProposal>;

export const ViewKind = z.enum([
  "configuration",
  "comparison",
  "collection",
  "explanation",
  "checkout",
]);
export type ViewKind = z.infer<typeof ViewKind>;

/** The single top-level schema handed to Mastra's `structuredOutput`. */
export const AssistantProposal = z
  .object({
    intent: Intent,
    view: ViewKind,
    /** Conversational reply. The only free prose that reaches the user. */
    message: z.string().max(2000),
    slots: z.array(ManifestSlotProposal).min(1).max(12),
    configuration: ConfigurationProposal.nullable().default(null),
    comparison: ComparisonProposal.nullable().default(null),
    collection: CollectionProposal.nullable().default(null),
    /** Follow-up prompts to render as chips. Prose only. */
    suggestedFollowUps: z.array(z.string().max(120)).max(4).default([]),
  })
  .strict()
  .superRefine((p, ctx) => {
    const need = (
      field: "configuration" | "comparison" | "collection",
      whenView: z.infer<typeof ViewKind>,
    ) => {
      if (p.view === whenView && p[field] === null) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `view "${whenView}" requires a non-null "${field}" payload`,
        });
      }
    };
    need("configuration", "configuration");
    need("comparison", "comparison");
    need("collection", "collection");
    if (p.view === "checkout" && p.configuration === null && p.intent !== "checkout") {
      ctx.addIssue({
        code: "custom",
        path: ["configuration"],
        message: "checkout view requires a configuration to check out",
      });
    }
  });
export type AssistantProposal = z.infer<typeof AssistantProposal>;
