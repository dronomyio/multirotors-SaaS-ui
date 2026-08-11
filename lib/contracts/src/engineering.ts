import { z } from "zod/v4";
import { ComponentHandle, Grams, Minutes, UnitInterval, Watts } from "./primitives";

/**
 * Server-computed engineering truth. Produced by deterministic code reading the
 * Neo4j graph — never by a model, never by the frontend.
 */

export const RuleSeverity = z.enum(["blocker", "warning", "info"]);
export type RuleSeverity = z.infer<typeof RuleSeverity>;

/**
 * A compatibility finding traced to a named rule. "Because the graph said so"
 * is not an acceptable answer to a customer spending $7k — every finding names
 * the rule and the components involved.
 */
export const CompatibilityFinding = z
  .object({
    ruleId: z.string().min(1),
    severity: RuleSeverity,
    subjects: z.array(ComponentHandle).min(1),
    /** Human-readable, generated from the rule template — not model prose. */
    message: z.string().min(1),
    /** Optional handles that would resolve this finding. */
    remedies: z.array(ComponentHandle).default([]),
  })
  .strict();
export type CompatibilityFinding = z.infer<typeof CompatibilityFinding>;

export const MassBudget = z
  .object({
    platformDryG: Grams,
    payloadG: Grams,
    batteryG: Grams,
    totalG: Grams,
    maxTakeoffG: Grams,
    /** totalG / maxTakeoffG. > 1 is a blocker, > 0.85 is a warning. */
    utilization: z.number().nonnegative(),
    headroomG: z.number(),
  })
  .strict();
export type MassBudget = z.infer<typeof MassBudget>;

export const PowerBudget = z
  .object({
    hoverW: Watts,
    avionicsW: Watts,
    payloadW: Watts,
    totalW: Watts,
    estimatedFlightMinutes: Minutes,
    /** How the flight-time number was derived, so support can defend it. */
    model: z.enum(["linear_wh_over_w", "vendor_curve", "empirical_lookup"]),
    /** ±minutes. Present the range, not a false-precision point estimate. */
    confidenceMinutes: Minutes,
  })
  .strict();
export type PowerBudget = z.infer<typeof PowerBudget>;

export const EngineeringAssessment = z
  .object({
    status: z.enum(["compatible", "compatible_with_warnings", "incompatible", "incomplete"]),
    findings: z.array(CompatibilityFinding).default([]),
    mass: MassBudget,
    power: PowerBudget,
    /** Aggregate confidence in the graph's coverage of this combination. */
    compatibilityConfidence: UnitInterval,
    /** Handles the graph has no edges for — honest about what we don't know. */
    unverifiedPairs: z.array(z.tuple([ComponentHandle, ComponentHandle])).default([]),
    computedAt: z.string().datetime(),
    /** Version of the rule set, so a quote can be reproduced later. */
    rulesetVersion: z.string().min(1),
  })
  .strict()
  .refine(
    (a) => a.status !== "incompatible" || a.findings.some((f) => f.severity === "blocker"),
    { message: "status 'incompatible' requires at least one blocker finding", path: ["findings"] },
  );
export type EngineeringAssessment = z.infer<typeof EngineeringAssessment>;
