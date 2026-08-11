"""Temporal provisioning as idempotent code, not README steps.

    uv run graph-provision

Creates the namespace, sets retention, registers search attributes, and installs
the catalog-sync schedule. Safe to run on every deploy — everything checks for
existence first.

Why code and not a runbook: a namespace someone forgot to create fails at
runtime as ``NamespaceNotFound`` on the first customer request, and search
attributes that were never registered make production workflows unqueryable
exactly when you most need to query them.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import timedelta

from temporalio.client import (
    Client,
    Schedule,
    ScheduleActionStartWorkflow,
    ScheduleAlreadyRunningError,
    ScheduleIntervalSpec,
    ScheduleSpec,
)
from temporalio.service import RPCError, RPCStatusCode

from graph_engine.names import TaskQueue, Workflow, catalog_sync_workflow_id

logger = logging.getLogger(__name__)

NAMESPACE = os.environ.get("TEMPORAL_NAMESPACE", "multirotors")
RETENTION_DAYS = int(os.environ.get("TEMPORAL_RETENTION_DAYS", "30"))
CATALOG_SYNC_MINUTES = int(os.environ.get("CATALOG_SYNC_MINUTES", "15"))

#: Custom search attributes turn "show me every session that hit a stale cache"
#: into a query rather than a log grep. Register them before anything sets them.
#: Values are `IndexedValueType` enum names.
SEARCH_ATTRIBUTES: dict[str, str] = {
    "MrSessionId": "Keyword",
    "MrConfigurationId": "Keyword",
    "MrMission": "Keyword",
    "MrAssessmentStatus": "Keyword",
    "MrSubtotalMinor": "Int",
}


def _retention(days: int):
    from google.protobuf.duration_pb2 import Duration

    d = Duration()
    d.FromTimedelta(timedelta(days=days))
    return d


async def ensure_namespace(address: str) -> None:
    """Create the namespace if absent. Connects to ``default`` to bootstrap."""
    from temporalio.api.workflowservice.v1 import (
        DescribeNamespaceRequest,
        RegisterNamespaceRequest,
    )

    bootstrap = await Client.connect(address, namespace="default")
    service = bootstrap.workflow_service

    try:
        await service.describe_namespace(DescribeNamespaceRequest(namespace=NAMESPACE))
        logger.info("namespace %s already exists", NAMESPACE)
        return
    except RPCError as err:
        if err.status is not RPCStatusCode.NOT_FOUND:
            raise

    await service.register_namespace(
        RegisterNamespaceRequest(
            namespace=NAMESPACE,
            workflow_execution_retention_period=_retention(RETENTION_DAYS),
            description="multirotors.store configuration and fulfilment",
        )
    )
    logger.info("registered namespace %s with %s-day retention", NAMESPACE, RETENTION_DAYS)
    # Registration propagates asynchronously; connecting immediately can still 404.
    await asyncio.sleep(2)


async def ensure_search_attributes(client: Client) -> None:
    from temporalio.api.enums.v1 import IndexedValueType
    from temporalio.api.operatorservice.v1 import (
        AddSearchAttributesRequest,
        ListSearchAttributesRequest,
    )

    operator = client.operator_service
    existing = await operator.list_search_attributes(
        ListSearchAttributesRequest(namespace=NAMESPACE)
    )
    present = set(existing.custom_attributes.keys())
    missing = {k: v for k, v in SEARCH_ATTRIBUTES.items() if k not in present}

    if not missing:
        logger.info("search attributes already registered")
        return

    await operator.add_search_attributes(
        AddSearchAttributesRequest(
            namespace=NAMESPACE,
            search_attributes={
                name: getattr(IndexedValueType, f"INDEXED_VALUE_TYPE_{kind.upper()}")
                for name, kind in missing.items()
            },
        )
    )
    logger.info("registered search attributes: %s", sorted(missing))


async def ensure_catalog_sync_schedule(client: Client) -> None:
    """One schedule, rather than a sleep loop inside a workflow.

    A schedule can be paused, backfilled, and inspected from the Temporal UI.
    A sleep loop inside a workflow can only be killed.
    """
    handle = client.get_schedule_handle("catalog-sync")
    try:
        await handle.describe()
        logger.info("catalog-sync schedule already installed")
        return
    except RPCError as err:
        if err.status is not RPCStatusCode.NOT_FOUND:
            raise

    try:
        await client.create_schedule(
            "catalog-sync",
            Schedule(
                action=ScheduleActionStartWorkflow(
                    Workflow.CATALOG_SYNC,
                    args=[CATALOG_SYNC_MINUTES, 6],
                    id=catalog_sync_workflow_id(),
                    task_queue=TaskQueue.GRAPH,
                ),
                spec=ScheduleSpec(
                    intervals=[
                        ScheduleIntervalSpec(every=timedelta(minutes=CATALOG_SYNC_MINUTES))
                    ]
                ),
            ),
        )
        logger.info("installed catalog-sync schedule every %s minutes", CATALOG_SYNC_MINUTES)
    except ScheduleAlreadyRunningError:
        logger.info("catalog-sync schedule created concurrently; nothing to do")


async def run() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
    address = os.environ.get("TEMPORAL_ADDRESS", "localhost:7233")

    await ensure_namespace(address)

    from temporalio.contrib.pydantic import pydantic_data_converter

    client = await Client.connect(
        address, namespace=NAMESPACE, data_converter=pydantic_data_converter
    )
    await ensure_search_attributes(client)
    await ensure_catalog_sync_schedule(client)
    logger.info("provisioning complete for namespace %s", NAMESPACE)


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
