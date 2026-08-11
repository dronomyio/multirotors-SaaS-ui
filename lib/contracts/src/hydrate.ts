import { z } from "zod/v4";
import type { CatalogComponent } from "./catalog";
import type { CommerceQuote } from "./commerce";
import type { EngineeringAssessment } from "./engineering";
import { UIManifest, type ManifestSlot, type ResolvedConfiguration } from "./manifest";
import type { ComponentHandle, ConfigurationId } from "./primitives";
import { AssistantProposal, type ViewKind } from "./proposal";
import {
  COMPONENT_TYPES,
  VIEW_ALLOWED_COMPONENTS,
  isComponentType,
  type ComponentType,
} from "./registry";

/**
 * THE TRUST BOUNDARY.
 *
 * Everything the model produced enters here as an untrusted `AssistantProposal`
 * and leaves as a `UIManifest` whose every number came from Shopify or Neo4j.
 * The ports below are implemented in the app (Neo4j driver, Shopify Storefront
 * API); this module owns the *rules*, so the rules are unit-testable without a
 * database.
 */

export class ContractViolation extends Error {
  constructor(
    message: string,
    readonly code:
      | "unknown_component_type"
      | "component_not_allowed_in_view"
      | "unknown_handle"
      | "model_supplied_fact"
      | "missing_payload"
      | "schema_invalid",
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ContractViolation";
  }
}

// ---------------------------------------------------------------------------
// Ports — implemented by the app, stubbed in tests
// ---------------------------------------------------------------------------

export interface CatalogPort {
  /** Neo4j + Shopify join. Unknown handles must be OMITTED, never fabricated. */
  resolveHandles(handles: readonly ComponentHandle[]): Promise<Map<ComponentHandle, CatalogComponent>>;
}

export interface EngineeringPort {
  assess(components: readonly CatalogComponent[]): Promise<EngineeringAssessment>;
}

export interface CommercePort {
  /** Prices at read time against Shopify. Never cached past `maxAgeMs`. */
  quote(
    lines: readonly { handle: ComponentHandle; quantity: number; rationale: string }[],
    components: Map<ComponentHandle, CatalogComponent>,
  ): Promise<CommerceQuote>;
}

export interface ConfigurationStore {
  load(id: ConfigurationId): Promise<ResolvedConfiguration | null>;
  save(config: ResolvedConfiguration): Promise<void>;
}

export interface HydrationPorts {
  catalog: CatalogPort;
  engineering: EngineeringPort;
  commerce: CommercePort;
  store: ConfigurationStore;
}

// ---------------------------------------------------------------------------
// Rule 1 — the model may only name components that exist in the registry
// ---------------------------------------------------------------------------

export function assertRegisteredComponents(types: readonly string[]): asserts types is ComponentType[] {
  for (const t of types) {
    if (!isComponentType(t)) {
      throw new ContractViolation(
        `assistant requested unregistered UI component "${t}"; registry contains: ${COMPONENT_TYPES.join(", ")}`,
        "unknown_component_type",
        { requested: t },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 2 — components must be legal for the view
// ---------------------------------------------------------------------------

export function assertComponentsAllowedInView(view: ViewKind, types: readonly ComponentType[]): void {
  const allowed = VIEW_ALLOWED_COMPONENTS[view] ?? [];
  for (const t of types) {
    if (!allowed.includes(t)) {
      throw new ContractViolation(
        `component "${t}" is not permitted in view "${view}"`,
        "component_not_allowed_in_view",
        { view, component: t, allowed },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 3 — every handle the model named must exist in the graph
// ---------------------------------------------------------------------------

export function assertAllHandlesResolved(
  requested: readonly ComponentHandle[],
  resolved: Map<ComponentHandle, CatalogComponent>,
): void {
  const missing = requested.filter((h) => !resolved.has(h));
  if (missing.length > 0) {
    throw new ContractViolation(
      `assistant referenced ${missing.length} component handle(s) absent from the catalog: ${missing.join(", ")}`,
      "unknown_handle",
      { missing },
    );
  }
}

// ---------------------------------------------------------------------------
// Rule 4 — the structural guarantee, restated as a runtime check
// ---------------------------------------------------------------------------

/**
 * Belt-and-braces: proves that no proposal field is being smuggled into a
 * priced slot. The proposal schema has no price fields at all, so this can only
 * fail if someone widens `proposal.ts` — which is exactly when we want a
 * loud failure rather than a silent regression.
 */
const FORBIDDEN_IN_PROPOSAL = [
  "price",
  "prices",
  "amount",
  "subtotal",
  "total",
  "sku",
  "variantId",
  "variant_id",
  "inventory",
  "quantityAvailable",
  "compatibility",
  "compatible",
  "payloadKg",
  "payloadG",
  "flightMinutes",
  "estimatedFlightMinutes",
] as const;

export function assertProposalCarriesNoFacts(proposal: unknown, path: string[] = []): void {
  if (proposal === null || typeof proposal !== "object") return;
  if (Array.isArray(proposal)) {
    proposal.forEach((v, i) => assertProposalCarriesNoFacts(v, [...path, String(i)]));
    return;
  }
  for (const [key, value] of Object.entries(proposal)) {
    if ((FORBIDDEN_IN_PROPOSAL as readonly string[]).includes(key)) {
      throw new ContractViolation(
        `model proposal contains authoritative field "${[...path, key].join(".")}"; ` +
          `facts must come from Shopify or Neo4j, not the language model`,
        "model_supplied_fact",
        { path: [...path, key] },
      );
    }
    assertProposalCarriesNoFacts(value, [...path, key]);
  }
}

// ---------------------------------------------------------------------------
// Parsing the model's output
// ---------------------------------------------------------------------------

export type ParseResult =
  | { ok: true; proposal: AssistantProposal }
  | { ok: false; violation: ContractViolation };

export function parseProposal(raw: unknown): ParseResult {
  const parsed = AssistantProposal.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      violation: new ContractViolation(
        "assistant output failed proposal schema validation",
        "schema_invalid",
        parsed.error.issues,
      ),
    };
  }
  try {
    assertProposalCarriesNoFacts(parsed.data);
    const types = parsed.data.slots.map((s) => s.type);
    assertRegisteredComponents(types);
    assertComponentsAllowedInView(parsed.data.view, types);
  } catch (e) {
    if (e instanceof ContractViolation) return { ok: false, violation: e };
    throw e;
  }
  return { ok: true, proposal: parsed.data };
}

// ---------------------------------------------------------------------------
// Final gate — nothing reaches the browser without passing this
// ---------------------------------------------------------------------------

export function assertManifestRenderable(manifest: unknown): UIManifest {
  const parsed = UIManifest.safeParse(manifest);
  if (!parsed.success) {
    throw new ContractViolation(
      "hydrated manifest failed schema validation; refusing to render",
      "schema_invalid",
      parsed.error.issues,
    );
  }
  assertComponentsAllowedInView(
    parsed.data.view,
    parsed.data.slots.map((s: ManifestSlot) => s.type),
  );
  return parsed.data;
}

/**
 * The safe fallback. When the model misbehaves the user sees an honest message
 * and a working UI — never a blank screen and never invented data.
 */
export function degradedManifest(reason: string): UIManifest {
  return UIManifest.parse({
    view: "explanation",
    slots: [
      {
        type: "explainer",
        emphasis: "primary",
        props: {
          title: "I couldn't put that configuration together",
          body:
            `I ran into a problem building a reliable answer (${reason}). ` +
            `Rather than show you numbers I can't stand behind, here's nothing at all — ` +
            `try rephrasing, or ask for a specific component and I'll look it up directly.`,
          relatedHandles: [],
        },
      },
    ],
  });
}

/** Convenience alias so app code imports rules and schema from one place. */
export const ManifestSchema = UIManifest;
