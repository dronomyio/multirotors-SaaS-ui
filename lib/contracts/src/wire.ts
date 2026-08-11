/**
 * THE CROSS-LANGUAGE WIRE CONTRACT.
 *
 * Temporal is language-agnostic: a TypeScript client can start a workflow that a
 * Python worker executes, because the wire protocol carries a workflow *type
 * name*, a task queue, and JSON payloads — not a language binding.
 *
 * Which means the names below are load-bearing in a way ordinary constants are
 * not. If TypeScript starts `"ConfigurationSession"` and the Python worker
 * registered `"configuration_session"`, nothing type-errors: the workflow simply
 * never gets picked up and the caller blocks until timeout. The failure surfaces
 * in production, hours later, as "the configurator is slow."
 *
 * So: this file is the single source of truth, `services/graph-engine/src/
 * graph_engine/names.py` mirrors it, and `tests/test_contract_parity.py`
 * fails the build if the two ever disagree.
 *
 * Rule: never inline one of these strings. Always import the constant.
 */

/** Task queues. Python workers poll these; the TS client targets them. */
export const TASK_QUEUE = {
  /** Graph + catalog work. Served by the Python graph-engine worker. */
  graph: "multirotors-graph",
  /** Order orchestration. Also Python, separated so it scales independently. */
  fulfilment: "multirotors-fulfilment",
} as const;

/** Workflow type names as registered by `@workflow.defn(name=...)` in Python. */
export const WORKFLOW = {
  configurationSession: "ConfigurationSession",
  catalogSync: "CatalogSync",
  orderFulfilment: "OrderFulfilment",
  /**
   * Short-lived wrapper so a synchronous caller (a Mastra tool) can run a single
   * graph activity and await its result. Temporal has no "just call an activity"
   * client API — activities only execute inside a workflow — so this is the
   * idiomatic shim rather than a design smell.
   */
  runActivity: "RunActivity",
} as const;

/** Signal names as registered by `@workflow.signal(name=...)`. */
export const SIGNAL = {
  addComponent: "addComponent",
  removeComponent: "removeComponent",
  applyProposal: "applyProposal",
  requestCheckout: "requestCheckout",
  abandon: "abandon",
} as const;

/** Query names as registered by `@workflow.query(name=...)`. */
export const QUERY = {
  currentConfiguration: "currentConfiguration",
  revision: "revision",
} as const;

/** Activity names as registered by `@activity.defn(name=...)`. */
export const ACTIVITY = {
  searchCandidates: "search_candidates",
  resolveComponents: "resolve_components",
  assessCompatibility: "assess_compatibility",
  priceConfiguration: "price_configuration",
  persistConfiguration: "persist_configuration",
  syncCatalogPage: "sync_catalog_page",
  buildCartUrl: "build_cart_url",
} as const;

export type TaskQueue = (typeof TASK_QUEUE)[keyof typeof TASK_QUEUE];
export type WorkflowName = (typeof WORKFLOW)[keyof typeof WORKFLOW];
export type SignalName = (typeof SIGNAL)[keyof typeof SIGNAL];
export type QueryName = (typeof QUERY)[keyof typeof QUERY];
export type ActivityName = (typeof ACTIVITY)[keyof typeof ACTIVITY];

/**
 * Deterministic workflow IDs. Reopening a laptop three days later must reattach
 * to the same build, not fork a second one.
 */
export const configurationWorkflowId = (sessionId: string): string => `config-session:${sessionId}`;
export const orderWorkflowId = (configurationId: string): string => `order:${configurationId}`;
export const catalogSyncWorkflowId = (): string => "catalog-sync:singleton";

/**
 * Emitted to `contracts.wire.json` by `scripts/export-wire.ts` and read by the
 * Python parity test. Keep in sync with the constants above — the exporter does
 * that automatically, so never hand-edit the JSON.
 */
export const WIRE_MANIFEST = {
  taskQueues: TASK_QUEUE,
  workflows: WORKFLOW,
  signals: SIGNAL,
  queries: QUERY,
  activities: ACTIVITY,
} as const;
