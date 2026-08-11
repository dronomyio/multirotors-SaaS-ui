/**
 * The TypeScript half of the Temporal bridge.
 *
 * A workflow started here is executed by the Python worker in
 * `services/graph-engine`. Nothing about that is magic: Temporal carries a
 * workflow *type name*, a task queue, and JSON payloads. Language never enters
 * the protocol.
 *
 * Two things must match across the boundary or the call silently hangs:
 *
 *   1. **Names.** Always from `@workspace/contracts`'s `wire.ts`. Never a literal.
 *   2. **Payload encoding.** Python's worker uses `pydantic_data_converter`,
 *      which is JSON-compatible, so the default converter here interoperates.
 *      Change one side's converter and payloads arrive as opaque bytes.
 *
 * There is deliberately no `getResult()` on the session workflow. It runs for
 * up to two weeks; the read path is the `currentConfiguration` query.
 */
import { Client, Connection, WorkflowNotFoundError } from "@temporalio/client";
import {
  QUERY,
  SIGNAL,
  TASK_QUEUE,
  WORKFLOW,
  configurationWorkflowId,
} from "@workspace/contracts";

export interface ConfigurationSnapshot {
  configurationId: string;
  sessionId: string;
  mission: string;
  selections: Record<string, number>;
  engineering: unknown | null;
  commerce: unknown | null;
  revision: number;
  updatedAt: string;
}

let cached: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (cached) return cached;
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });
  cached = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
  });
  return cached;
}

/**
 * Attach to a customer's build, starting it if this is the first turn.
 *
 * `signalWithStart` is the whole trick: it starts the workflow if absent and
 * signals it if present, atomically. Doing start-then-signal by hand races on
 * the second browser tab, and the loser silently drops the customer's change.
 */
export async function ensureSession(params: {
  sessionId: string;
  configurationId: string;
}): Promise<string> {
  const client = await getTemporalClient();
  const workflowId = configurationWorkflowId(params.sessionId);

  const handle = await client.workflow.signalWithStart(WORKFLOW.configurationSession, {
    workflowId,
    taskQueue: TASK_QUEUE.graph,
    args: [params.sessionId, params.configurationId],
    signal: SIGNAL.applyProposal,
    signalArgs: [[]],
    // Two weeks: matches the workflow's own idle timeout.
    workflowExecutionTimeout: "14 days",
  });

  return handle.workflowId;
}

export async function applyProposal(sessionId: string, handles: string[]): Promise<void> {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(configurationWorkflowId(sessionId));
  await handle.signal(SIGNAL.applyProposal, handles);
}

export async function addComponent(
  sessionId: string,
  componentHandle: string,
  quantity = 1,
): Promise<void> {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(configurationWorkflowId(sessionId));
  await handle.signal(SIGNAL.addComponent, componentHandle, quantity);
}

export async function removeComponent(sessionId: string, componentHandle: string): Promise<void> {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(configurationWorkflowId(sessionId));
  await handle.signal(SIGNAL.removeComponent, componentHandle);
}

export async function requestCheckout(sessionId: string): Promise<void> {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(configurationWorkflowId(sessionId));
  await handle.signal(SIGNAL.requestCheckout);
}

/**
 * The read path. Returns null when no session exists yet — a fresh visitor is
 * the normal case, not an error, and must not surface as a 500.
 */
export async function readConfiguration(
  sessionId: string,
): Promise<ConfigurationSnapshot | null> {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(configurationWorkflowId(sessionId));
  try {
    return await handle.query<ConfigurationSnapshot | null>(QUERY.currentConfiguration);
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) return null;
    throw err;
  }
}
