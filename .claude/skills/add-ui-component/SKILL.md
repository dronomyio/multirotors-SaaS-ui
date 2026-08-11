---
name: add-ui-component
description: Add a new component to the composable UI registry that the assistant can compose with. Use when the assistant needs to render something the current 13 components cannot express.
---

# Adding a registry component

The assistant selects from a closed set of UI primitives. Adding one is a
deliberate act touching four places; miss any and it fails, though at different
times.

## 1. Register the name

`lib/contracts/src/registry.ts` — add to `COMPONENT_TYPES`, then add it to every
entry of `VIEW_ALLOWED_COMPONENTS` where it is legal.

Be deliberate about the second part. The allowlist is what stops the assistant
putting a `checkout_cta` inside an `explanation` view — nudging a purchase
mid-explanation is a validation failure here, not a rendering choice.

If the component displays money, availability, or compatibility, add it to
`AUTHORITATIVE_ONLY_COMPONENTS` too.

## 2. Define the props

`lib/contracts/src/manifest.ts` — add a `slot("your_type", { ... })` schema and
include it in the `ManifestSlot` discriminated union.

Props must be **fully resolved values**, not identifiers to fetch. The renderer
does no fetching and no arithmetic. If your component needs a price, the prop is
a `Money`, not a variant id.

Follow the honesty conventions already in the file:

- an explicit `emptyMessage` rather than rendering nothing
- a required `disabledReason` whenever an `enabled: false` is possible
- nullable for genuinely unknown values, so the UI can say "unknown" instead of
  showing `0`

## 3. Hydrate it

Wherever the manifest is built server-side, populate the new slot from Shopify
and Neo4j data. Never from the model's proposal — the model chose *that this
panel appears*, not what is in it.

## 4. Implement the React component

`artifacts/multirotors-store/src/components/manifest/` — add the component and
register it in `REGISTRY`.

The `Registry` type is `{ [K in ComponentType]: ComponentType<PropsFor<K>> }`, so
omitting the entry is a **compile error**. That is the point: step 4 cannot be
forgotten silently.

Style with existing Tailwind tokens only. Replit restyles freely below the props
boundary, so anything hardcoded here is churn.

## 5. Verify

```bash
pnpm --filter @workspace/contracts run test   # registry/manifest parity test
pnpm run typecheck
```

The parity test asserts `COMPONENT_TYPES` and the props union are exactly the
same set. It fails if you did step 1 without step 2.

## Before adding one at all

Ask whether an existing component with different props would do. Thirteen
primitives the assistant understands well beat twenty it picks between badly —
every addition widens the choice it has to get right on every turn.
