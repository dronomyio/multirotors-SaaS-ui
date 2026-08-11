import { z } from "zod/v4";
import { UIManifest } from "./manifest";
import { ConfigurationId, SessionId } from "./primitives";
import { Intent } from "./proposal";

/**
 * What the API actually returns to the browser. One shape for every turn,
 * regardless of intent — the frontend has exactly one response parser.
 */

export const Diagnostics = z
  .object({
    /** Set when the model's proposal was rejected and we fell back. */
    degraded: z.boolean().default(false),
    degradedReason: z.string().nullable().default(null),
    modelMs: z.number().int().nonnegative().nullable().default(null),
    hydrationMs: z.number().int().nonnegative().nullable().default(null),
    rulesetVersion: z.string().nullable().default(null),
    /** Temporal workflow + run ids, so a support ticket maps to a replayable history. */
    workflowId: z.string().nullable().default(null),
    runId: z.string().nullable().default(null),
  })
  .strict();
export type Diagnostics = z.infer<typeof Diagnostics>;

export const AssistantResponse = z
  .object({
    sessionId: SessionId,
    turnId: z.string().uuid(),
    intent: Intent,
    /** The assistant's prose. Model-sourced; render as chat, never as spec. */
    message: z.string(),
    manifest: UIManifest,
    /** Present whenever a configuration exists in session state. */
    configurationId: ConfigurationId.nullable().default(null),
    revision: z.number().int().nonnegative().nullable().default(null),
    suggestedFollowUps: z.array(z.string()).max(4).default([]),
    diagnostics: Diagnostics,
  })
  .strict();
export type AssistantResponse = z.infer<typeof AssistantResponse>;
