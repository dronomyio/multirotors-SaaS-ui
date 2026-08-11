# Review of `multirotors-SaaS-ui-main`

Read against the actual repo, not the description. Everything below was verified
against the source; the two typecheck claims were reproduced with `tsc` under
your own `tsconfig.base.json`.

---

## First: my previous message was wrong about your stack

I designed the contract layer against assumptions that the zip corrects.

| I assumed | Actually |
|---|---|
| Mastra orchestrates the agent | No Mastra. A hand-rolled OpenAI function-calling loop, `api-server/src/lib/agent.ts`, 347 lines, `MAX_ITERATIONS = 8` |
| Hand-written schemas are the contract | **OpenAPI-first.** `lib/api-spec/openapi.yaml` → Orval → `lib/api-zod` (schemas) + `lib/api-client-react` (react-query hooks) |
| zod v4 | zod `3.25.76` pinned in the workspace catalog, imported as `zod/v4` |
| Neo4j / Temporal / Postgres product data | Postgres holds conversations + messages only. Product data is fetched live from Shopify's **public unauthenticated** `products.json` |
| Shopify Admin API for orders | No Admin API. `createShopifyDraftOrder` builds a `/cart/{variantId}:{qty}` permalink. `draftOrderId` is the literal string `"direct"` — despite the name, the OpenAPI schema, and the route path, no draft order is created |

I've retargeted the contracts package accordingly: `@workspace/contracts` in
`lib/contracts`, `zod/v4` imports, `zod: "catalog:"`, extensionless relative
imports, `tsconfig` extending your base. It typechecks clean under
`tsconfig.base.json` and all 19 tests pass against zod 3.25.76.

---

## The pricing defect — precise scope

The invoice the customer sees is **entirely model output**:

`agent.ts:268` — the `generateProFormaInvoice` tool body is `return args;`. The
model's `price`, `subtotal`, `tax`, `shipping`, and `total` pass through
untouched.

`agent.ts:252` — `calculateQuoteMetadata` sums `item.price * item.quantity` from
values the *model* supplied, not from Shopify. So even the "calculated" figures
are derived from model input.

`invoice-extractor.ts:31` — `InvoiceSchema.safeParse` is the only gate, and
`price: z.number()` accepts any number. This validates *shape*, not *truth*. The
comment calls it "write-time validation," which reads as stronger than it is.

**What this does and does not cost you.** It is not a "sell a $10k drone for
$499" hole — I checked. `createShopifyDraftOrder` ignores `item.price` entirely
and builds a cart permalink from variant IDs, so Shopify prices from its own
catalog at checkout. The customer is charged correctly.

The damage is that a customer is **quoted** $6,430, clicks through, and lands on
a cart totalling something else. That's a trust and chargeback problem, and for
a $7k purchase it's the kind customers screenshot. Credit where due: the UI does
disclose that external items are excluded (`InvoiceCard.tsx:253`).

**Dead validation worth deleting.** `routes/shopify/index.ts:43` validates
`typeof item.price === "number"` on the draft-order body and then never uses it.
Your OpenAPI `DraftOrderItem` marks `price` required. Both imply a price
contract that doesn't exist — a future maintainer could reasonably wire it up.

### The fix, shipped

`api-server/src/lib/invoice-reprice.ts` — 10 tests, typechecks clean.

- Re-prices every `source: "store"` line from Shopify by variant ID
- Integer cents throughout; tax is basis points, not `subtotal * 0.085` on floats
- Per-line status: `verified` / `corrected` / `unavailable` / `unknown_variant` / `external`
- Store and external totalled **separately**, because only store items reach the cart
- `purchasable` flag to gate the checkout CTA
- `toLegacyInvoice()` projects back onto your existing `Invoice` shape, so the current UI needs no changes

Wire it in at `routes/openai/index.ts` where `extractInvoice` returns, before
persisting to `messages.metadata`.

**Arithmetic bug it also fixes.** `InvoiceCard.tsx:283` displays
`storeSubtotal + invoice.tax + invoice.shipping` on the checkout button, but
`invoice.tax` was computed on the *combined* store+external subtotal
(`agent.ts:258`). Any quote with an external item overstates the checkout figure.
Concretely: a $1,299 store item plus a $600 external item shows $161.42 tax
against a store-only cart that owes $110.42.

---

## Build is currently red

`shopify-client.ts:128` reads `p.product_type` and `p.vendor`, neither declared
on `RestProduct` (lines 41–49). Reproduced under your `tsconfig.base.json`:

```
error TS2339: Property 'product_type' does not exist on type 'RestProduct'.
error TS2339: Property 'vendor' does not exist on type 'RestProduct'.
```

Since root `build` is `pnpm run typecheck && pnpm -r run build`, this fails the
whole build. Add both as optional fields.

---

## Other findings

**Catalog refetch, unbounded.** Every `searchShopifyCatalog` call fetches two
250-product pages and filters in memory (`shopify-client.ts:111`). With
`MAX_ITERATIONS = 8` and multi-item requests, one conversation can pull the
catalog a dozen times. `getVariantIndex()` in the new module is a TTL-cached,
single-flight index — repoint search at it.

**Pagination silently truncates.** `?page=2` caps you at 500 products with no
signal when there are more; `getProductCollections` checks a hardcoded
`KNOWN_COLLECTIONS` list of 10 against a store the code says has ~99.

**Duplicated Invoice schema.** `lib/api-zod/src/invoice.ts` and
`multirotors-store/src/types/chat.ts` define the same schemas twice. The shared
package exists precisely to prevent this; the frontend should import from it.
They're already drifting — `types/chat.ts` adds a `DraftOrderInput` interface
that duplicates the generated OpenAPI type.

**Zod import inconsistency.** `lib/db` uses `zod/v4`; `lib/api-zod/src/invoice.ts`
uses plain `zod` (v3 classic API). Same package, two different APIs.

**Tax is hardcoded 8.5%** for every destination.

**No bounds check** on `response.choices[0].message` (`agent.ts:303`).

**Prompt has two "STEP 3" headings** (`agent.ts:190`, `194`).

**`replit.md` is still the template** — every section below "Stack" is an
unfilled placeholder. That file is what a future agent session reads first.

---

## Where the composable architecture attaches

Your `__INVOICE__ … __INVOICE__` sentinel is a manifest in embryo: the model
already emits structured state that the UI renders as a fixed layout. The
generalisation is to let the model choose *which* panels appear while the server
supplies every value.

The contracts package is that, with the split I argued for last time — and the
repo now shows exactly why it matters, since `return args` is the concrete form
of "the model supplied a fact."

Sequencing I'd suggest:

1. **Repricing** — merge `invoice-reprice.ts`; fixes a live customer-facing defect.
2. **Fix the build** — the two `RestProduct` fields.
3. **Manifest, one view** — add `UIManifest` to `openapi.yaml` (it must flow
   through Orval, not around it) and render `configuration` view from the
   registry. `messages.metadata` jsonb already has somewhere to persist it.
4. **Neo4j** — only once a compatibility question exists that Shopify tags can't
   answer. Right now nothing in the repo needs a graph.
5. **Temporal** — after there is durable state worth resuming. Today a
   conversation is rows in Postgres and a cart permalink; there's no long-running
   workflow yet for it to own.

I'd hold 4 and 5 until 1–3 land. `temporal.ts` in the contracts package defines
the activity boundary so the code you write now stays activity-shaped.

---

# Addendum — cross-checking Replit's audit

Replit's assessment is accurate on every claim I could verify. Confirmed by grep:
the only Mastra/Neo4j/Temporal references in the tree are the ones I added. Six
agent tools, 500-product search ceiling, no Admin API, cart-permalink checkout,
external items dropped — all correct.

Two things its map leaves out, and one class of defect it doesn't cover.

## The artifact map is incomplete

Missing from Replit's tree: the **`mockup-sandbox`** artifact, and five of the
seven `lib/` packages — `api-spec`, `api-zod`, `api-client-react`, `db`,
`integrations-openai-ai-react`, `integrations-openai-ai-server`.

That omission matters more than it looks. `lib/api-spec/openapi.yaml` is the
source of truth for the entire API surface, and Orval regenerates `api-zod` and
`api-client-react` from it. An audit that lists `artifacts/` but not `lib/`
reads as "the app is four services," when it's actually four services over a
codegen pipeline. Anyone adding an endpoint by hand-editing generated files will
have it silently reverted on the next `codegen` run.

## The Invoice schema exists in three places, and the shared one is unused

| Location | Form | Runtime validation |
|---|---|---|
| `lib/api-zod/src/invoice.ts` | Zod | ✅ |
| `multirotors-store/src/types/chat.ts` | Zod (duplicate) | ✅ |
| `multirotors-store-mobile/types/chat.ts` | **plain interfaces** | ❌ none |

`invoice.ts` describes itself as "shared between the API server and web/mobile
clients." Grep says otherwise: **no frontend imports `@workspace/api-zod`.** Only
`api-server` does. The web app re-declares the schema; mobile re-declares it as
bare TypeScript interfaces with no validator behind them.

## Mobile is materially weaker than web, in ways worth knowing

**No runtime validation of network data.** `app/chat/[id].tsx:380`:

```ts
evt = JSON.parse(raw) as SseEvent;
```

A type assertion, not a parse. Whatever the SSE stream sends becomes an
`Invoice`. And line 156:

```ts
invoice: m.metadata ? (m.metadata as unknown as Invoice) : undefined,
```

`as unknown as` is the double-cast that exists specifically to silence the
compiler — arbitrary Postgres jsonb straight into a typed Invoice. The web app
at least runs `InvoiceSchema.safeParse`. If a legacy row or a schema change ever
puts a differently-shaped object in `messages.metadata`, web degrades and mobile
renders undefined into a price.

**No external-item disclosure.** Web shows the explicit warning at
`InvoiceCard.tsx:253` — external items are excluded from Shopify checkout,
prices are market estimates. Mobile has only an `EXTERNAL` badge on the row, and
displays `invoice.total` — the *combined* figure — as the headline number next
to the checkout button. So on mobile a customer sees a grand total, taps
through, and reaches a cart containing only the store subset, with no warning
that happened.

That makes mobile the sharper edge of the quoting problem, not web. Point
`repriceInvoice` at the shared path before the manifest work, and have both
clients import from `@workspace/api-zod` rather than their own copies.

## What Replit's audit doesn't cover

It answers "what's connected" accurately and doesn't attempt "what's wrong" —
so the pricing passthrough at `agent.ts:268`, the red build, the tax arithmetic,
the triplicated schema, and the mobile validation gap are all outside its scope
rather than contradicted by it. Worth reading the two together: Replit's map for
what exists, this for what to fix first.
