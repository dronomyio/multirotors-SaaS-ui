# graph-engine (Python)

Neo4j engineering graph, MySQL catalog cache, and the Temporal workers that
TypeScript drives. See @../../CLAUDE.md for the repo-wide rules.

## Commands

```bash
uv sync --extra dev
uv run pytest              # 39 tests; no Neo4j, MySQL, or Temporal server needed
uv run ruff check src tests
uv run mypy
uv run graph-worker        # polls the multirotors-graph task queue
```

Tests use SQLite in-memory for the cache and pure functions for the rules, so
they run in CI with no services. If a test needs a live database, it is testing
the wrong thing.

## Layout

```
src/graph_engine/
├── names.py              ← Temporal names. Mirrors lib/contracts/src/wire.ts
├── contracts.py          ← Pydantic mirrors of the TypeScript types
├── graph/
│   ├── client.py         ← Neo4j driver + Cypher. No business logic
│   └── rules.py          ← Compatibility engine. PURE — no I/O, no clock
├── cache/
│   ├── models.py         ← SQLAlchemy tables (MySQL)
│   └── repository.py     ← Reads/writes, with mandatory freshness checks
└── temporal/
    ├── activities.py     ← The ONLY place I/O happens
    ├── workflows.py      ← Deterministic. No network, no clock, no random
    └── worker.py         ← Entrypoint, dependency wiring
```

## The rules engine is pure on purpose

`graph/rules.py` takes resolved components plus graph edges and returns an
assessment. It never opens a connection and never reads the clock — `computed_at`
is injected.

That buys three things: every rule is unit-testable without Neo4j, a quote is
reproducible later from the same inputs plus `RULESET_VERSION`, and the maths
can be called from a Temporal activity without dragging I/O into replay.

Bump `RULESET_VERSION` on any change to thresholds or formulas. It is stamped on
every assessment so a three-month-old quote can be explained rather than guessed
at.

## Workflow determinism

`temporal/workflows.py` is replayed from history on every worker restart. Code
that behaves differently on replay corrupts the workflow.

Banned in workflow code: `datetime.now()`, `random`, `uuid4()`, network calls,
file I/O, any import with side effects. Use `workflow.now()`, `workflow.random()`,
`workflow.uuid4()`, and put everything else behind an activity.

Imports that need to reach the real module (rather than the sandbox's copy) go
inside `with workflow.unsafe.imports_passed_through():`. That block is already
set up for contracts and names — extend it rather than importing at the top.

## Activity naming

Every activity carries an explicit `name=` from `names.Activity`:

```python
@activity.defn(name=Activity.ASSESS_COMPATIBILITY)
async def assess_compatibility(self, inp: AssessCompatibilityInput) -> EngineeringAssessment:
```

Never let the name default to the Python function name. A refactor that renames
the method would silently stop matching what TypeScript dispatches, and the
symptom is a hung client rather than an error.

Mutating activities take an idempotency key and must be replay-safe. Temporal
retries on at-least-once semantics, which is only safe if you make it safe.

## Graph modelling

```
(:Component {handle, kind, mass_g, typical_power_w, ...})
  -[:COMPATIBLE_WITH {reason, verified_at}]-> (:Component)
  -[:INCOMPATIBLE_WITH {reason}]->            (:Component)
  -[:SUITED_FOR]->                            (:Mission {name})
```

`handle` is the join key to Shopify and the only component identifier the model
ever emits. A `:Component` node stores `variant_id` but **never a price** — a
price on a graph node is stale by definition and someone is about to quote it.

Absence of a `COMPATIBLE_WITH` edge does not mean compatible. It means unknown,
and `assess()` reports it in `unverified_pairs`.

## Cross-language contract

`names.py` mirrors `lib/contracts/src/wire.ts`. After changing either:

```bash
pnpm --filter @workspace/contracts run export-wire
uv run pytest tests/test_contract_parity.py
```

That test also checks that the names are actually attached to the decorators,
not merely present as constants — the two failure modes are different and both
are silent.

## Style

- `from __future__ import annotations` at the top of every module.
- Full type annotations; `mypy --strict` is expected to pass.
- Pydantic models use `alias_generator=to_camel` and `extra="forbid"`. The wire
  format is camelCase; Python attributes stay snake_case.
- Money is `int` minor units. Never `float`, never `Decimal` on the wire.
