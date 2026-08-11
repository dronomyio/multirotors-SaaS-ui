# multirotors.store — AI-driven engineering commerce

A Shopify storefront where the UI composes itself around what the customer is
trying to build. An assistant interprets a mission ("thermal inspection drone
under $7,000, GPS-denied"), the server resolves it against an engineering graph
and live catalog data, and the page assembles from a fixed registry of trusted
components.

## The one rule

**The model chooses presentation. The server supplies every fact.**

The language model may select components by handle and choose which UI panels
appear in what order. It may not produce a price, a SKU, an inventory count, a
compatibility verdict, a payload mass, or a flight time. Those fields do not
exist on its output schema — `lib/contracts/src/proposal.ts` has no place to put
them, and `assertProposalCarriesNoFacts` fails loudly if anyone adds one.

This is not a style preference. Before it was enforced, `agent.ts` shipped the
model's invented prices straight to the customer via `return args`.

## Run & operate

```bash
# TypeScript
pnpm install
pnpm run typecheck                                    # all TS packages
pnpm --filter @workspace/api-server run dev           # API on :5000
pnpm --filter @workspace/contracts run export-wire    # regenerate cross-language artifacts
pnpm --filter @workspace/api-spec run codegen         # regenerate Orval client + zod
pnpm --filter @workspace/db run push                  # push Drizzle schema (dev only)

# Python
cd services/graph-engine
uv sync --extra dev
uv run pytest                                          # 76 tests, no servers required
uv run graph-provision                                 # namespace, search attrs, schedules
uv run graph-worker                                    # Temporal worker

# Full stack
docker compose -f docker/docker-compose.yml up -d
```

Required env: `DATABASE_URL` (Postgres), `CATALOG_CACHE_URL` (MySQL),
`NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD`, `TEMPORAL_ADDRESS`,
`SHOPIFY_STORE_DOMAIN`, `OPENAI_API_KEY`.

## Where things live

| Path | Owns |
|---|---|
| `lib/api-spec/openapi.yaml` | **Source of truth for the HTTP API.** Orval generates from it |
| `lib/api-zod`, `lib/api-client-react` | **Generated.** Never hand-edit; `codegen` overwrites |
| `lib/contracts` | Cross-boundary types: proposal, manifest, registry, wire names |
| `lib/db` | Drizzle schema — conversations and messages only |
| `artifacts/api-server` | Express API, agent loop, Shopify reads, SSE |
| `artifacts/multirotors-store` | React storefront + chat + manifest renderer |
| `artifacts/multirotors-store-mobile` | Expo app |
| `services/graph-engine` | **Python.** Ontology, Neo4j, MySQL cache, Qdrant, Temporal workers |
| `docker/` | Full local stack: Neo4j, MySQL, Qdrant, Temporal, Phoenix |

## Language boundaries

Deliberate, not accidental:

- **TypeScript** — anything a browser or the agent touches. UI, Mastra, API.
- **Python** — anything graph- or workflow-shaped. Neo4j, Temporal, rules engine.
- **Bridge** — Temporal. A TS client starts a workflow; a Python worker runs it.
  There is no bespoke RPC layer to keep in sync.

Because Temporal dispatches on *strings*, the names in `lib/contracts/src/wire.ts`
and `services/graph-engine/src/graph_engine/names.py` must agree exactly. They
are checked by `tests/test_contract_parity.py`. A mismatch does not throw — the
client just blocks until timeout. See @services/graph-engine/CLAUDE.md.

## Data ownership

Each fact has exactly one owner. Read from the owner; never cache a fact
somewhere that outlives its truth.

| Fact | Owner | Notes |
|---|---|---|
| SKU, price, inventory, purchasability | **Shopify** | MySQL mirrors it with `synced_at`; readers must state a staleness tolerance |
| Compatibility, mounts, engineering specs | **Neo4j** | Never stores a price |
| Conversations, messages | **Postgres** | Drizzle |
| Catalog cache | **MySQL** | A cache. Never a second source of truth |
| Component semantics, assistant memory | **Qdrant** | Recall only. Never a source of price or availability |
| Configuration session state | **Temporal** | Durable, queryable, survives restarts |

## Ontology

Compatibility is **derived**, not curated. Hand-authoring `COMPATIBLE_WITH` is
O(n²) — 400 SKUs is 80,000 pairs nobody will maintain. Instead the graph stores
*reasons*: a compute `PROVIDES` a `csi` interface, a sensor `CONSUMES` one, and
attachment follows. Missions expand to capabilities transitively, so asking for
solar inspection surfaces the GNSS dependency the customer never mentioned.

Verdicts are graded — `verified` (bench-tested) beats `inferred` (interfaces
match) beats `unknown`. Collapsing those into one boolean is how you end up
promising something nobody tested. A curated edge always wins over inference,
and requires `verified_at` and `verified_by` to be written at all.

## Search

Three retrievers, fused by reciprocal rank fusion: capability graph (precise),
Qdrant semantic (recall), Neo4j full-text (fallback when Qdrant is down). RRF
needs only rank, so it doesn't care that one returns cosine similarity and
another an ordinal — no score threshold to re-tune.

Traces record which retriever surfaced each candidate. When the assistant misses
an obvious product, the useful question is *which* retriever missed it.

## Memory

Qdrant holds per-session assistant memory: preferences, constraints, decisions,
rejections. Recall is **session-scoped without exception** — one customer's
build is not context for another's.

Memory recalls what the customer *wants*, never what something *costs*. A
remembered price is a stale price, and this codebase has already shipped one
bug where numbers felt authoritative because they were nearby.

## Architecture decisions

- **Money is integer minor units everywhere** — TS, Python, MySQL. `subtotal * 0.085`
  on floats produces customer-visible nonsense; tax is basis points.
- **The catalog cache refuses stale reads.** `require_fresh()` raises rather than
  serving an old price. A cache that silently serves three-day-old prices is
  worse than no cache.
- **Unknown compatibility is reported, not assumed.** Pairs with no graph edge
  land in `unverified_pairs` and lower `compatibility_confidence`.
- **Flight time ships as a range.** `confidence_minutes` is required. A flat "31
  minutes" is a promise the aircraft will not keep.
- **Incompatible builds are not priced.** Quoting a configuration that cannot fly
  invites someone to buy it.

## Gotchas

- `pnpm` only. The root `preinstall` refuses npm and yarn.
- **Never hand-edit `lib/api-zod/src/generated/**` or `lib/api-client-react/src/generated/**`.**
  Change `openapi.yaml`, then run codegen.
- After changing `lib/contracts/src/wire.ts`, run `export-wire` **and** the Python
  parity tests. Skipping this is the one mistake that fails silently in production.
- `zod` is `3.25.76` and imported as **`zod/v4`**. Plain `from "zod"` gets the v3
  API; both exist in that version and they are not the same library.
- `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440` as supply-chain defence.
  Do not disable it to install a package published today.
- Python targets 3.11+. Workflow code in `temporal/workflows.py` must stay
  deterministic — no I/O, no `datetime.now()`, no `random`. Use `workflow.now()`.

## Working agreement with Replit

Replit sharpens the visual design; this repo owns behaviour. The seam is the
props contract in `lib/contracts/src/manifest.ts`.

- **Safe for Replit to change freely:** class names, Tailwind tokens, spacing,
  colour, typography, animation, component internals below the props boundary.
- **Not safe to change without updating the contract first:** the props a
  registry component accepts, the set of keys in `COMPONENT_TYPES`, or anything
  in `VIEW_ALLOWED_COMPONENTS`.

If a component needs new data, add it to the manifest schema and the hydration
step — do not fetch inside a component. The renderer is deliberately dumb.

## Pointers

- @lib/contracts/README.md — the contract layer and its four enforced rules
- @services/graph-engine/CLAUDE.md — Python service, Temporal, graph modelling
- @docker/README.md — running the full stack locally
- @FINDINGS.md — audit of the pre-existing code and what remains outstanding
