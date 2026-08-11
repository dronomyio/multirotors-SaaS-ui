"""Worker entrypoint.

    uv run graph-worker

Env:
    TEMPORAL_ADDRESS      default localhost:7233
    TEMPORAL_NAMESPACE    default default
    NEO4J_URI/_USER/_PASSWORD
    CATALOG_CACHE_URL     mysql+pymysql://user:pass@host:3306/multirotors_cache

The Pydantic data converter is what lets the TypeScript client hand this worker
a plain JSON object and have it arrive as a validated model. Without it,
activities receive dicts and every signature above is a comfortable lie.
"""

from __future__ import annotations

import asyncio
import logging
import os

from temporalio.client import Client
from temporalio.contrib.pydantic import pydantic_data_converter
from temporalio.worker import Worker

from graph_engine.cache.repository import CatalogCache
from graph_engine.graph.client import GraphClient
from graph_engine.names import TaskQueue
from graph_engine.temporal.activities import Deps, GraphActivities
from graph_engine.temporal.workflows import CatalogSync, ConfigurationSession, RunActivity

logger = logging.getLogger(__name__)


async def connect() -> Client:
    return await Client.connect(
        os.environ.get("TEMPORAL_ADDRESS", "localhost:7233"),
        namespace=os.environ.get("TEMPORAL_NAMESPACE", "default"),
        # Must match the TypeScript client's converter, or payloads decode as
        # opaque bytes on one side of the bridge.
        data_converter=pydantic_data_converter,
    )


async def run() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))

    graph = GraphClient.from_env()
    await graph.verify()
    await graph.ensure_schema()

    cache = CatalogCache.from_env()
    cache.create_all()

    activities = GraphActivities(Deps(graph=graph, cache=cache))
    client = await connect()

    worker = Worker(
        client,
        task_queue=TaskQueue.GRAPH,
        workflows=[ConfigurationSession, CatalogSync, RunActivity],
        activities=[
            activities.search_candidates,
            activities.resolve_components,
            activities.assess_compatibility,
            activities.price_configuration,
            activities.sync_catalog_page,
            activities.build_cart_url,
        ],
    )

    logger.info("graph-engine worker polling %s", TaskQueue.GRAPH)
    try:
        await worker.run()
    finally:
        await graph.close()


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
