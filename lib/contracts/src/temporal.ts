import { z } from "zod/v4";
import type { CatalogComponent } from "./catalog";
import type { CommerceQuote } from "./commerce";
import type { EngineeringAssessment } from "./engineering";
import type { ResolvedConfiguration } from "./manifest";
import { ComponentHandle, ConfigurationId, Money, SessionId } from "./primitives";
import type { AssistantProposal } from "./proposal";

/**
 * TEMPORAL CONTRACTS.
 *
 * The durable spine. A ConfigurationSession workflow owns the authoritative
 * configuration state for the life of a customer's build — across page
 * reloads, devices, and days — and an OrderFulfilment workflow takes over at
 * checkout.
 *
 * Division of labour:
 *   - Workflow code is deterministic: state machine, signal handling, timers.
 *     It never touches Neo4j, Shopify, or the model directly.
 *   - Activities are the only place I/O happens. Each is idempotent and keyed
 *     so a retry cannot double-charge or double-reserve.
 *
 * Mastra tool `execute` bodies should be thin wrappers that call the SAME
 * functions the activities call — so the intelligence layer and the durable
 * layer can never drift apart in what they believe a component costs.
 */

/**
 * Task queues and deterministic workflow IDs live in `wire.ts` — the file the
 * Python parity test checks. Re-exported here so callers have a single import
 * site, but never redefined: two sources of truth for a Temporal name is
 * precisely the failure this package exists to prevent.
 */
export { TASK_QUEUE, configurationWorkflowId, orderWorkflowId } from "./wire";

// ---------------------------------------------------------------------------
// Activity interface — implement this once, share with Mastra tools
// ---------------------------------------------------------------------------

export interface IdempotencyKey {
  /** Stable per logical operation. Required on every mutating activity. */
  idempotencyKey: string;
}

export interface ConfigurationActivities {
  /** Neo4j: expand a mission brief into candidate handles. Read-only. */
  searchCandidates(input: {
    mission: string;
    kinds: readonly string[];
    constraints: Record<string, unknown>;
    limit: number;
  }): Promise<ComponentHandle[]>;

  /** Neo4j + Shopify join. Read-only. Omits unknown handles rather than inventing. */
  resolveComponents(input: { handles: readonly ComponentHandle[] }): Promise<CatalogComponent[]>;

  /** Deterministic rules engine over the graph. Read-only, cacheable by input hash. */
  assessCompatibility(input: { handles: readonly ComponentHandle[] }): Promise<EngineeringAssessment>;

  /** Shopify Storefront read. Prices are never cached beyond `maxAgeMs`. */
  priceConfiguration(input: {
    lines: readonly { handle: ComponentHandle; quantity: number; rationale: string }[];
    maxAgeMs: number;
  }): Promise<CommerceQuote>;

  /** Postgres upsert. Idempotent on (configurationId, revision). */
  persistConfiguration(input: { config: ResolvedConfiguration } & IdempotencyKey): Promise<void>;

  /** Shopify cart create/update. Idempotent on idempotencyKey. */
  syncCart(
    input: { configurationId: ConfigurationId; cartId: string | null } & IdempotencyKey,
  ): Promise<{ cartId: string; checkoutUrl: string; total: Money }>;

  /** Optional: hold stock on long builds. Compensated by releaseReservation. */
  reserveInventory(
    input: { configurationId: ConfigurationId; ttlSeconds: number } & IdempotencyKey,
  ): Promise<{ reservationId: string; expiresAt: string }>;

  releaseInventory(input: { reservationId: string } & IdempotencyKey): Promise<void>;

  /** Mastra call, wrapped as an activity so retries and timeouts are visible. */
  runAssistantTurn(input: {
    sessionId: SessionId;
    userMessage: string;
    configurationId: ConfigurationId | null;
  }): Promise<AssistantProposal>;
}

// ---------------------------------------------------------------------------
// Signals and queries — the workflow's public surface
// ---------------------------------------------------------------------------

export const AddComponentSignal = z
  .object({ handle: ComponentHandle, quantity: z.number().int().positive().max(16) })
  .strict();
export type AddComponentSignal = z.infer<typeof AddComponentSignal>;

export const RemoveComponentSignal = z.object({ handle: ComponentHandle }).strict();
export type RemoveComponentSignal = z.infer<typeof RemoveComponentSignal>;

export const ApplyProposalSignal = z
  .object({ proposalId: z.string().uuid(), handles: z.array(ComponentHandle).min(1) })
  .strict();
export type ApplyProposalSignal = z.infer<typeof ApplyProposalSignal>;

export const SIGNALS = {
  addComponent: "addComponent",
  removeComponent: "removeComponent",
  applyProposal: "applyProposal",
  requestCheckout: "requestCheckout",
  abandon: "abandon",
} as const;

export const QUERIES = {
  /** Returns ResolvedConfiguration | null. The frontend polls this on reconnect. */
  currentConfiguration: "currentConfiguration",
  revision: "revision",
} as const;

// ---------------------------------------------------------------------------
// Workflow input
// ---------------------------------------------------------------------------

export const ConfigurationSessionInput = z
  .object({
    sessionId: SessionId,
    /** Workflow self-terminates after this idle period, releasing any holds. */
    idleTimeoutSeconds: z.number().int().positive().default(60 * 60 * 24 * 14),
    /** Re-price if the quote is older than this when the user acts. */
    priceMaxAgeMs: z.number().int().positive().default(5 * 60 * 1000),
    /** continueAsNew after N signals to keep history bounded. */
    historyLimit: z.number().int().positive().default(500),
  })
  .strict();
export type ConfigurationSessionInput = z.infer<typeof ConfigurationSessionInput>;

/**
 * Retry policy guidance, expressed as data so the worker and the docs agree.
 *
 * `priceConfiguration` and `syncCart` are the ones that matter: pricing is a
 * pure read and can retry freely, cart mutation must carry an idempotency key
 * because Shopify will happily create two carts.
 */
export const ACTIVITY_POLICY = {
  searchCandidates: { startToCloseSeconds: 15, maximumAttempts: 3 },
  resolveComponents: { startToCloseSeconds: 15, maximumAttempts: 3 },
  assessCompatibility: { startToCloseSeconds: 30, maximumAttempts: 3 },
  priceConfiguration: { startToCloseSeconds: 20, maximumAttempts: 5 },
  persistConfiguration: { startToCloseSeconds: 15, maximumAttempts: 5 },
  syncCart: { startToCloseSeconds: 30, maximumAttempts: 5 },
  reserveInventory: { startToCloseSeconds: 30, maximumAttempts: 3 },
  releaseInventory: { startToCloseSeconds: 30, maximumAttempts: 10 },
  /** Model calls: long timeout, few retries — a retry storm is expensive. */
  runAssistantTurn: { startToCloseSeconds: 120, maximumAttempts: 2 },
} as const satisfies Record<
  keyof ConfigurationActivities,
  { startToCloseSeconds: number; maximumAttempts: number }
>;
