# Integration

Short answer: **yes, copy the files in — nothing is overwritten.** I diffed
every delivered path against your original tree: zero collisions, zero
modifications, zero deletions.

But copying alone won't make it build. Four things need doing, and two of them
touch files Replit owns.

---

## 1. Copy and install

```bash
unzip -o multirotors-full-stack.zip -d /path/to/repo
cd /path/to/repo
pnpm install
```

`pnpm-workspace.yaml` needs **no change** — its `lib/*` glob already covers
`lib/contracts` and `lib/mastra`. `services/` is intentionally outside the pnpm
workspace; it's Python.

New third-party deps: `@mastra/core`, `@temporalio/client`, `vitest`. Everything
else resolves from your existing catalog (`zod`, `tsx`, `@types/node`).

---

## 2. Add two project references — **root `tsconfig.json`**

Without this, `pnpm run typecheck` silently skips both new packages, and
`tsc --build` can't resolve `@workspace/contracts` from `@workspace/mastra`.

```jsonc
{
  "extends": "./tsconfig.base.json",
  "compileOnSave": false,
  "files": [],
  "references": [
    { "path": "./lib/db" },
    { "path": "./lib/api-client-react" },
    { "path": "./lib/api-zod" },
    { "path": "./lib/integrations-openai-ai-server" },
    { "path": "./lib/contracts" },   // ← add
    { "path": "./lib/mastra" }       // ← add
  ]
}
```

Both new packages are `composite: true` with `emitDeclarationOnly`, matching the
pattern in `lib/db` and `lib/api-zod`. Verified: `tsc --build` emits 26
declaration files and zero `.js`, as house style expects.

---

## 3. Fix the build — **`artifacts/api-server/src/lib/shopify-client.ts`**

This is pre-existing and unrelated to my work, but `pnpm run build` is
`typecheck && build`, so **nothing builds until it's fixed**. Line 128 reads two
fields that aren't declared:

```ts
interface RestProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  variants: RestVariant[];
  images: Array<{ src: string }>;
  currency?: string;
  product_type?: string;   // ← add
  vendor?: string;         // ← add
}
```

---

## 4. Verify

```bash
pnpm --filter @workspace/contracts run export-wire
pnpm run typecheck
pnpm --filter @workspace/contracts run test        # 27 tests
pnpm --filter @workspace/api-server run test       # 10 repricing tests

cd services/graph-engine && uv sync --extra dev && uv run pytest   # 76 tests
```

---

## What is NOT wired up yet

Everything above gets the code compiling and tested. It does **not** put it in
the request path — that requires editing two files Replit actively owns, which
is a conversation to have with them first rather than a merge conflict to
discover later.

### `artifacts/api-server/src/routes/openai/index.ts`

`invoice-reprice.ts` sits beside `agent.ts` but nothing calls it. Until it's
wired in, **the pricing defect is still live**: the invoice a customer sees is
still whatever the model produced.

Where `extractInvoice` returns, before persisting to `messages.metadata`:

```ts
import { repriceInvoice, toLegacyInvoice } from "../../lib/invoice-reprice";

const { text, invoice } = extractInvoice(raw);
let corrected = invoice;
if (invoice) {
  const repriced = await repriceInvoice(invoice);
  corrected = toLegacyInvoice(repriced, invoice);
  if (repriced.diverged) {
    logger.warn({ corrections: repriced.corrections }, "AI invoice diverged from Shopify");
  }
}
```

`toLegacyInvoice` keeps the existing `Invoice` shape, so `InvoiceCard.tsx` needs
no change.

### `artifacts/multirotors-store/src/components/chat/ChatMain.tsx`

The manifest renderer isn't mounted. Rendering a `UIManifest` alongside (or
instead of) `InvoiceCard` is the switch from a fixed invoice layout to a
composed one — worth doing deliberately, after the repricing lands.

---

## Suggested order

1. **The `RestProduct` fix.** One minute, unblocks everything, zero risk.
2. **Copy + references + install.** Additive; nothing changes behaviour.
3. **Wire repricing.** Fixes a live customer-facing defect. Smallest change with
   the largest payoff.
4. **Move both clients onto `@workspace/api-zod`.** Three copies of the Invoice
   schema are already drifting; a fourth consumer makes it worse.
5. **Mount the renderer.** The actual architecture change — do it once the
   contract is proven in production by step 3.

Steps 1–3 are safe to do without coordinating with Replit. Steps 4–5 touch the
chat UI, so agree the split first.

---

## Docker

The stack is independent of the above and can run today:

```bash
docker compose -f docker/docker-compose.yml up -d
```

It needs no changes to any Replit file. See @docker/README.md.

**Caveat:** I validated the compose YAML, the service dependency graph, and every
volume reference, but I could not run `docker compose up` — no Docker daemon in
the environment I built this in. Image tags are pinned; verify on first boot.
