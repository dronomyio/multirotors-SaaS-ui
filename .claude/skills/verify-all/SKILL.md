---
name: verify-all
description: Run the full cross-language verification suite — TypeScript typecheck and tests, Python tests, and cross-language contract parity. Use before committing, before opening a PR, or when asked whether the build is green.
allowed-tools: Bash(pnpm run typecheck) Bash(pnpm run build) Bash(pnpm --filter * run test) Bash(pnpm --filter * run export-wire) Bash(uv run pytest*) Bash(uv run ruff*) Bash(uv run mypy*) Bash(git status*) Bash(git diff*)
---

# Full verification

Run in this order. Later steps depend on earlier artifacts, and stopping at the
first failure saves reading noise caused by an upstream break.

## 1. Regenerate cross-language artifacts

```bash
pnpm --filter @workspace/contracts run export-wire
```

Do this first. The Python parity test reads what it emits, so running it second
tests the previous commit's contract.

## 2. TypeScript

```bash
pnpm run typecheck
pnpm --filter @workspace/contracts run test
pnpm --filter @workspace/api-server run test
```

`pnpm run typecheck` covers all packages. Note the root `build` script is
`typecheck && build`, so a type error anywhere fails the whole build.

## 3. Python

```bash
cd services/graph-engine
uv run pytest -q
uv run ruff check src tests
uv run mypy
```

## 4. Confirm the artifacts are committed

```bash
git status --short lib/contracts/dist-wire/
```

If `wire.json` or `schema.json` are dirty, the contract changed. Commit them —
Python reads these files, so an uncommitted change means CI tests a different
contract than the one you are shipping.

## Interpreting failures

| Symptom | Cause |
|---|---|
| `test_wire_section_matches` fails | `wire.ts` and `names.py` disagree. Fix Python; TypeScript is the source of truth |
| `test_activity_names_are_registered` fails | The constant is right but a decorator's `name=` is missing or wrong |
| `test_top_level_fields_match` fails | A Pydantic model and its Zod counterpart drifted. Check the camelCase alias |
| Registry parity test fails | A name was added to `COMPONENT_TYPES` without a props schema, or vice versa |
| `TS2339` in `shopify-client.ts` | Known: `RestProduct` is missing `product_type` and `vendor`. See FINDINGS.md |

## Report honestly

Give the actual counts and the actual failures. If something could not run —
missing service, absent dependency — say that it was skipped rather than
implying it passed. "39 passed, mypy not run (uv unavailable)" is a useful
report; "all green" when a step was skipped is not.
