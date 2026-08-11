---
name: change-contract
description: Change a type or Temporal name that crosses the TypeScript/Python boundary. Use when editing lib/contracts, adding a workflow signal or activity, or when the cross-language parity test fails.
---

# Changing a cross-boundary contract

TypeScript is the source of truth. Python asserts agreement. Do these in order —
skipping step 3 is the mistake that fails silently in production rather than in
CI.

## 1. Change TypeScript first

| Changing | Edit |
|---|---|
| A type crossing the boundary | `lib/contracts/src/{catalog,engineering,commerce,manifest}.ts` |
| A Temporal workflow/signal/query/activity name | `lib/contracts/src/wire.ts` |
| What the model may emit | `lib/contracts/src/proposal.ts` — see the warning below |
| An HTTP request/response shape | `lib/api-spec/openapi.yaml`, then run codegen |

**Before adding a field to `proposal.ts`, stop.** That file is the model's entire
output surface. If the field is a price, SKU, inventory count, compatibility
verdict, payload mass, or flight time, it does not belong there — the server
computes it during hydration. `assertProposalCarriesNoFacts` will fail the build,
and it is right to.

## 2. Export the artifacts

```bash
pnpm --filter @workspace/contracts run export-wire
```

Writes `lib/contracts/dist-wire/{wire,schema}.json`. Commit them — Python reads
these at test time. Never hand-edit them.

## 3. Mirror in Python

Edit `services/graph-engine/src/graph_engine/names.py` (Temporal names) and/or
`contracts.py` (Pydantic models).

Two conventions the parity test enforces:

- Wire format is camelCase; Python attributes stay snake_case. The
  `alias_generator=to_camel` on the `Wire` base handles it — do not write
  camelCase attribute names in Python.
- `extra="forbid"` mirrors Zod's `.strict()`. An unexpected field means the two
  sides drifted, and that should be loud.

## 4. Verify both languages

```bash
pnpm --filter @workspace/contracts run test
pnpm run typecheck
cd services/graph-engine && uv run pytest tests/test_contract_parity.py -q
```

The parity test checks names in both directions *and* that they are attached to
the decorators, not merely defined as constants. Those are different failures and
both are silent at runtime.

## 5. If you added a Temporal name

A new activity also needs registering on the worker (`temporal/worker.py`), or
it will never be polled. A new signal needs a handler on the workflow class. The
parity test catches the constant being absent; it cannot catch a worker that
forgot to list the activity — check `worker.py` by eye.

## Why this ceremony

Temporal dispatches on strings carried over the wire. If TypeScript starts
`"ConfigurationSession"` and Python registered `"configuration_session"`, nothing
type-errors and nothing throws. The client blocks until its timeout, and the
symptom reaching you is "the configurator feels slow."
