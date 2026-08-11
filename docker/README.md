# Local stack

```bash
cp docker/.env.example .env      # optional; every value has a dev default
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml logs -f graph-worker
```

First boot takes a couple of minutes: Temporal's `auto-setup` image creates its
Postgres schema, and Neo4j's first start is slow. The dependency graph uses
`condition: service_healthy`, so the worker waits rather than crash-looping.

| Service | URL | Credentials |
|---|---|---|
| Neo4j Browser | http://localhost:7474 | `neo4j` / `multirotors_dev` |
| Temporal UI | http://localhost:8080 | — |
| Qdrant dashboard | http://localhost:6333/dashboard | — |
| Phoenix (traces) | http://localhost:6006 | — |
| API server | http://localhost:5000 | — |
| MySQL | `localhost:3306` | `root` / `multirotors_dev` |

## What runs at startup

`graph-provision` is a one-shot container that exits 0. It creates the Temporal
namespace, registers search attributes, and installs the catalog-sync schedule —
all idempotent, so it runs on every `up`. `graph-worker` waits for it via
`condition: service_completed_successfully`.

If provisioning fails, the worker never starts. That is intentional: a worker
polling a namespace that does not exist logs a confusing error every second
forever, and looks like a code fault.

## Sending traces to Arize instead of Phoenix

Both speak OTLP. Swap the endpoint and add credentials:

```yaml
OTEL_EXPORTER_OTLP_ENDPOINT: https://otlp.arize.com/v1/traces
ARIZE_SPACE_ID: ${ARIZE_SPACE_ID}
ARIZE_API_KEY: ${ARIZE_API_KEY}
```

With no endpoint set at all, spans go to the console rather than being dropped
silently.

## Scaling workers

```bash
GRAPH_WORKER_REPLICAS=3 docker compose -f docker/docker-compose.yml up -d
```

Temporal load-balances across pollers on the same task queue, so this needs no
other change.

## Notes on the images

- **Both app images run as non-root** (uid 10001). A worker that can reach Neo4j
  and MySQL should not also be able to rewrite its own image.
- **Dependency layers are copied before source**, so editing a `.py` or `.ts`
  file does not re-resolve the dependency tree.
- **The pnpm store is a build cache mount**, not a disabled
  `minimumReleaseAge`. That setting is supply-chain defence — do not turn it off
  to make a build faster.
- **The Qdrant image is distroless** — no `curl`, no `wget`. Its healthcheck
  uses the Qdrant binary itself.

## Resetting

```bash
docker compose -f docker/docker-compose.yml down -v   # drops all volumes
```

That deletes the graph, the catalog cache, the vector index, and all Temporal
history. Provisioning re-runs on the next `up`; the catalog re-syncs within
`CATALOG_SYNC_MINUTES`.
