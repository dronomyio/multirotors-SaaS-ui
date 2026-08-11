/**
 * The Mastra configurator agent.
 *
 * Replaces the hand-rolled OpenAI loop in `artifacts/api-server/src/lib/agent.ts`.
 * The substantive difference is not the framework — it is that this agent
 * cannot emit a price.
 *
 * Tools return handles and qualitative facts. They never return money to the
 * model, because a model that has seen `1299.00` will happily repeat it back
 * slightly wrong, and `AssistantProposal` has nowhere to put it anyway.
 */
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod/v4";
import {
  AssistantProposal,
  ComponentHandle,
  ComponentKind,
  MissionProfile,
  SensorModality,
  degradedManifest,
  parseProposal,
} from "@workspace/contracts";

import { getTemporalClient } from "./temporal-client";
import { ACTIVITY, TASK_QUEUE } from "@workspace/contracts";

/**
 * Tool bodies run graph work as Temporal activities rather than calling Neo4j
 * directly, so the intelligence layer and the durable layer can never disagree
 * about what the graph said. Retries, timeouts, and latency become visible in
 * the Temporal UI instead of vanishing into an agent loop.
 */
async function runActivity<T>(name: string, input: unknown): Promise<T> {
  const client = await getTemporalClient();
  // The generic must describe the *workflow's* signature, not the return type:
  // `() => Promise<T>` tells Temporal the workflow takes no arguments, which
  // types `args` as `undefined` and rejects everything we pass.
  return client.workflow.execute<(name: string, input: unknown) => Promise<T>>("RunActivity", {
    taskQueue: TASK_QUEUE.graph,
    workflowId: `activity:${name}:${Date.now()}`,
    args: [name, input],
  });
}

const searchCatalog = createTool({
  id: "search-catalog",
  description:
    "Find candidate components in the engineering graph for a mission and component kind. " +
    "Returns component handles only. Prices are applied by the server after you choose — " +
    "you will not see them and must not state one.",
  inputSchema: z.object({
    mission: MissionProfile,
    kind: ComponentKind,
    modality: SensorModality.nullable().default(null),
    limit: z.number().int().min(1).max(24).default(12),
  }),
  outputSchema: z.object({ handles: z.array(ComponentHandle) }),
  // Mastra passes validated input nested under `context` — not destructured
  // directly. The published docs still show the flat form; @mastra/core 0.20.2
  // does not.
  execute: async ({ context }) => {
    const handles = await runActivity<string[]>(ACTIVITY.searchCandidates, {
      mission: context.mission,
      kinds: [context.kind],
      requiredModalities: context.modality ? [context.modality] : [],
      requiredAutonomy: [],
      limit: context.limit,
    });
    return { handles: handles.map((h) => ComponentHandle.parse(h)) };
  },
});

const checkCompatibility = createTool({
  id: "check-compatibility",
  description:
    "Ask the engineering rules engine whether a set of component handles works together. " +
    "This is the ONLY source of compatibility truth — never assert compatibility yourself, " +
    "and never guess a payload mass or flight time.",
  inputSchema: z.object({ handles: z.array(ComponentHandle).min(2) }),
  outputSchema: z.object({
    status: z.enum(["compatible", "compatible_with_warnings", "incompatible", "incomplete"]),
    blockers: z.array(z.string()),
    warnings: z.array(z.string()),
    unverifiedPairCount: z.number().int(),
  }),
  execute: async ({ context }) => {
    const a = await runActivity<{
      status: "compatible" | "compatible_with_warnings" | "incompatible" | "incomplete";
      findings: { severity: string; message: string }[];
      unverifiedPairs: unknown[];
    }>(ACTIVITY.assessCompatibility, { handles: context.handles });

    return {
      status: a.status,
      blockers: a.findings.filter((f) => f.severity === "blocker").map((f) => f.message),
      warnings: a.findings.filter((f) => f.severity === "warning").map((f) => f.message),
      unverifiedPairCount: a.unverifiedPairs.length,
    };
  },
});

export const configuratorAgent = new Agent({
  id: "multirotors-configurator",
  name: "Multirotors Configurator",
  model: process.env.CONFIGURATOR_MODEL ?? "openai/gpt-5.6-sol",
  tools: { searchCatalog, checkCompatibility },
  instructions: `
You are the configuration assistant for multirotors.store, a drone and robotics
systems retailer. Customers come to you describing a *mission*, not a product.

Your job is to understand what they are trying to build and select components by
handle. You do not know prices, SKUs, stock levels, payload figures, or flight
times. The server computes all of those after you respond, and any number you
invent is discarded and logged as a contract violation.

Rules:
- Select components only by handle, and only handles returned by search-catalog.
- Never assert two parts are compatible without calling check-compatibility.
- Never state or estimate a price, total, flight time, or payload mass. Say
  "I'll price this up for you" and let the configuration panel show it.
- If check-compatibility returns unverified pairs, say so plainly. "We haven't
  bench-tested that combination" is a better answer than false confidence.
- Choose which panels appear via "slots", in the order they should appear. You
  are choosing presentation, not data.
- If you cannot map the request to a configuration, set intent to
  "out_of_scope" and use the explanation view.
`.trim(),
});

export interface TurnResult {
  proposal: ReturnType<typeof parseProposal> extends { ok: true; proposal: infer P } ? P : never;
}

/**
 * One conversational turn. The model's output is untrusted until `parseProposal`
 * has run — a violation degrades to an honest message rather than a blank screen
 * or, worse, a plausible wrong number.
 */
export async function runTurn(userMessage: string) {
  const response = await configuratorAgent.generate(userMessage, {
    structuredOutput: { schema: AssistantProposal },
  });

  const result = parseProposal(response.object);
  if (!result.ok) {
    console.error("[contract-violation]", result.violation.code, result.violation.detail);
    return { ok: false as const, manifest: degradedManifest(result.violation.code) };
  }
  return { ok: true as const, proposal: result.proposal };
}
