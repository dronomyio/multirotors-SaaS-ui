"""Mirror of ``lib/contracts/src/wire.ts``.

Temporal dispatches on *string* names carried over the wire, so a mismatch
between what TypeScript starts and what Python registers does not fail at import
time, at type-check time, or even loudly at runtime — the client simply blocks
until its timeout while the task sits unpolled on a queue nobody listens to.

``tests/test_contract_parity.py`` reads the JSON emitted by the TypeScript
exporter and fails if any name here disagrees. That test is the only reason it
is safe to have the same strings in two languages.

Never inline these values. Import the constant.
"""

from __future__ import annotations

from typing import Final


class TaskQueue:
    """Queues this service's workers poll."""

    GRAPH: Final = "multirotors-graph"
    FULFILMENT: Final = "multirotors-fulfilment"


class Workflow:
    """Workflow type names, as passed to ``@workflow.defn(name=...)``."""

    CONFIGURATION_SESSION: Final = "ConfigurationSession"
    CATALOG_SYNC: Final = "CatalogSync"
    ORDER_FULFILMENT: Final = "OrderFulfilment"
    #: Short-lived wrapper so a synchronous TypeScript caller can await a single
    #: activity. Temporal only executes activities inside a workflow.
    RUN_ACTIVITY: Final = "RunActivity"


class Signal:
    """Signal names, as passed to ``@workflow.signal(name=...)``."""

    ADD_COMPONENT: Final = "addComponent"
    REMOVE_COMPONENT: Final = "removeComponent"
    APPLY_PROPOSAL: Final = "applyProposal"
    REQUEST_CHECKOUT: Final = "requestCheckout"
    ABANDON: Final = "abandon"


class Query:
    """Query names, as passed to ``@workflow.query(name=...)``."""

    CURRENT_CONFIGURATION: Final = "currentConfiguration"
    REVISION: Final = "revision"


class Activity:
    """Activity names, as passed to ``@activity.defn(name=...)``."""

    SEARCH_CANDIDATES: Final = "search_candidates"
    RESOLVE_COMPONENTS: Final = "resolve_components"
    ASSESS_COMPATIBILITY: Final = "assess_compatibility"
    PRICE_CONFIGURATION: Final = "price_configuration"
    PERSIST_CONFIGURATION: Final = "persist_configuration"
    SYNC_CATALOG_PAGE: Final = "sync_catalog_page"
    BUILD_CART_URL: Final = "build_cart_url"


def configuration_workflow_id(session_id: str) -> str:
    """Deterministic, so reconnecting attaches instead of forking a second build."""
    return f"config-session:{session_id}"


def order_workflow_id(configuration_id: str) -> str:
    return f"order:{configuration_id}"


def catalog_sync_workflow_id() -> str:
    return "catalog-sync:singleton"


#: Shape mirrored by ``WIRE_MANIFEST`` in wire.ts; compared key-for-key by the parity test.
WIRE_MANIFEST: Final[dict[str, dict[str, str]]] = {
    "taskQueues": {"graph": TaskQueue.GRAPH, "fulfilment": TaskQueue.FULFILMENT},
    "workflows": {
        "configurationSession": Workflow.CONFIGURATION_SESSION,
        "catalogSync": Workflow.CATALOG_SYNC,
        "orderFulfilment": Workflow.ORDER_FULFILMENT,
        "runActivity": Workflow.RUN_ACTIVITY,
    },
    "signals": {
        "addComponent": Signal.ADD_COMPONENT,
        "removeComponent": Signal.REMOVE_COMPONENT,
        "applyProposal": Signal.APPLY_PROPOSAL,
        "requestCheckout": Signal.REQUEST_CHECKOUT,
        "abandon": Signal.ABANDON,
    },
    "queries": {
        "currentConfiguration": Query.CURRENT_CONFIGURATION,
        "revision": Query.REVISION,
    },
    "activities": {
        "searchCandidates": Activity.SEARCH_CANDIDATES,
        "resolveComponents": Activity.RESOLVE_COMPONENTS,
        "assessCompatibility": Activity.ASSESS_COMPATIBILITY,
        "priceConfiguration": Activity.PRICE_CONFIGURATION,
        "persistConfiguration": Activity.PERSIST_CONFIGURATION,
        "syncCatalogPage": Activity.SYNC_CATALOG_PAGE,
        "buildCartUrl": Activity.BUILD_CART_URL,
    },
}
