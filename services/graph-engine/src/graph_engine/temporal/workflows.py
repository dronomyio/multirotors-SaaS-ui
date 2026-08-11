"""Temporal workflows. Deterministic code only — no network, no clock, no random.

Everything that touches Neo4j, MySQL, or Shopify lives in ``activities.py`` and
is reached through ``workflow.execute_activity``. Anything else and replay
diverges, which surfaces as a workflow that behaves differently on worker
restart than it did the first time.

``ConfigurationSession`` is the durable spine: it owns the authoritative
configuration for the life of a customer's build, survives page reloads and
worker deploys, and is addressed by a deterministic workflow id so reopening a
laptop three days later reattaches rather than forking a second build.
"""

from __future__ import annotations

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ApplicationError

with workflow.unsafe.imports_passed_through():
    from graph_engine.contracts import (
        AssessCompatibilityInput,
        CommerceQuote,
        ConfigurationState,
        EngineeringAssessment,
        PriceConfigurationInput,
    )
    from graph_engine.names import Activity, Query, Signal, Workflow

# Reads are cheap and idempotent: retry freely.
READ_RETRY = RetryPolicy(maximum_attempts=3, initial_interval=timedelta(seconds=1))
# Pricing may hit a cold cache; give the sync workflow time to catch up.
PRICE_RETRY = RetryPolicy(maximum_attempts=5, initial_interval=timedelta(seconds=2))


@workflow.defn(name=Workflow.CONFIGURATION_SESSION)
class ConfigurationSession:
    """One customer's build, held durably.

    State transitions happen only in signal handlers; the ``run`` loop waits.
    That keeps the history readable — every change has a signal event that
    caused it, which is what makes a support ticket answerable months later.
    """

    def __init__(self) -> None:
        self._state: ConfigurationState | None = None
        self._selections: dict[str, int] = {}
        self._revision = 0
        self._signals_handled = 0
        self._checkout_requested = False
        self._abandoned = False
        self._dirty = False

    @workflow.run
    async def run(
        self,
        session_id: str,
        configuration_id: str,
        idle_timeout_seconds: int = 60 * 60 * 24 * 14,
        price_max_age_seconds: int = 300,
        history_limit: int = 500,
        seed_selections: dict[str, int] | None = None,
    ) -> ConfigurationState:
        self._selections = dict(seed_selections or {})
        self._state = ConfigurationState(
            configuration_id=configuration_id,
            session_id=session_id,
            selections=dict(self._selections),
            revision=self._revision,
        )
        if self._selections:
            self._dirty = True

        while True:
            # Wake on any signal, or when the session has gone quiet long enough
            # that holding the workflow open no longer earns its keep.
            got_signal = await workflow.wait_condition(
                lambda: self._dirty or self._checkout_requested or self._abandoned,
                timeout=timedelta(seconds=idle_timeout_seconds),
            )
            if not got_signal:
                workflow.logger.info("configuration session idle-timed out")
                return self._state

            if self._abandoned:
                workflow.logger.info("configuration session abandoned by user")
                return self._state

            if self._dirty:
                self._dirty = False
                await self._recompute(price_max_age_seconds)

            if self._checkout_requested:
                self._checkout_requested = False
                url = await workflow.execute_activity(
                    Activity.BUILD_CART_URL,
                    list(self._selections.items()),
                    start_to_close_timeout=timedelta(seconds=30),
                    retry_policy=READ_RETRY,
                )
                if self._state.commerce is not None:
                    self._state = self._state.model_copy(
                        update={
                            "commerce": self._state.commerce.model_copy(
                                update={"checkout_url": url}
                            )
                        }
                    )

            # Keep history bounded on long-lived builds. Selections carry over;
            # the workflow id is unchanged, so clients never notice.
            if self._signals_handled >= history_limit:
                workflow.logger.info("continuing as new to bound history")
                workflow.continue_as_new(
                    args=[
                        session_id,
                        configuration_id,
                        idle_timeout_seconds,
                        price_max_age_seconds,
                        history_limit,
                        dict(self._selections),
                    ]
                )

    async def _recompute(self, price_max_age_seconds: int) -> None:
        """Reassess and reprice. Both are activities; neither runs inline."""
        handles = sorted(self._selections)
        if not handles:
            return

        assessment: EngineeringAssessment = await workflow.execute_activity(
            Activity.ASSESS_COMPATIBILITY,
            AssessCompatibilityInput(handles=handles),
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=READ_RETRY,
        )

        quote: CommerceQuote | None = None
        # Don't price a build that cannot fly. Quoting an incompatible
        # configuration invites the customer to buy it.
        if assessment.status.value != "incompatible":
            quote = await workflow.execute_activity(
                Activity.PRICE_CONFIGURATION,
                PriceConfigurationInput(
                    lines=[(h, self._selections[h]) for h in handles],
                    max_age_seconds=price_max_age_seconds,
                ),
                start_to_close_timeout=timedelta(seconds=20),
                retry_policy=PRICE_RETRY,
            )

        self._revision += 1
        self._state = ConfigurationState(
            configuration_id=self._state.configuration_id,
            session_id=self._state.session_id,
            mission=self._state.mission,
            selections=dict(self._selections),
            engineering=assessment,
            commerce=quote,
            revision=self._revision,
            updated_at=workflow.now().isoformat(timespec="seconds"),
        )

    # ── Signals ──────────────────────────────────────────────────────────────

    @workflow.signal(name=Signal.ADD_COMPONENT)
    async def add_component(self, handle: str, quantity: int = 1) -> None:
        self._signals_handled += 1
        self._selections[handle] = self._selections.get(handle, 0) + max(1, quantity)
        self._dirty = True

    @workflow.signal(name=Signal.REMOVE_COMPONENT)
    async def remove_component(self, handle: str) -> None:
        self._signals_handled += 1
        if self._selections.pop(handle, None) is not None:
            self._dirty = True

    @workflow.signal(name=Signal.APPLY_PROPOSAL)
    async def apply_proposal(self, handles: list[str]) -> None:
        """Replace the whole selection set with what the assistant proposed."""
        self._signals_handled += 1
        self._selections = {h: 1 for h in handles}
        self._dirty = True

    @workflow.signal(name=Signal.REQUEST_CHECKOUT)
    async def request_checkout(self) -> None:
        self._signals_handled += 1
        self._checkout_requested = True

    @workflow.signal(name=Signal.ABANDON)
    async def abandon(self) -> None:
        self._signals_handled += 1
        self._abandoned = True

    # ── Queries ──────────────────────────────────────────────────────────────

    @workflow.query(name=Query.CURRENT_CONFIGURATION)
    def current_configuration(self) -> ConfigurationState | None:
        return self._state

    @workflow.query(name=Query.REVISION)
    def revision(self) -> int:
        return self._revision


@workflow.defn(name=Workflow.RUN_ACTIVITY)
class RunActivity:
    """Run one read-only activity and return it.

    Exists because Temporal has no client API for "just execute this activity" —
    activities only run inside a workflow. A Mastra tool that needs a synchronous
    graph answer starts this, awaits the result, and it completes in milliseconds.

    Deliberately restricted to reads. A generic passthrough that could invoke
    *any* activity would let a caller trigger cart mutations by name, which is
    the kind of convenience that turns into an incident.
    """

    ALLOWED = frozenset(
        {
            Activity.SEARCH_CANDIDATES,
            Activity.RESOLVE_COMPONENTS,
            Activity.ASSESS_COMPATIBILITY,
        }
    )

    @workflow.run
    async def run(self, activity_name: str, payload: object) -> object:
        if activity_name not in self.ALLOWED:
            raise ApplicationError(
                f"activity {activity_name!r} is not callable via RunActivity; "
                f"allowed: {sorted(self.ALLOWED)}",
                type="ActivityNotAllowed",
                non_retryable=True,
            )
        return await workflow.execute_activity(
            activity_name,
            payload,
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=READ_RETRY,
        )


@workflow.defn(name=Workflow.CATALOG_SYNC)
class CatalogSync:
    """Keeps the MySQL cache warm. Runs forever, one page at a time.

    Sequential rather than parallel on purpose: this hits Shopify's public
    endpoint, which is unauthenticated and shared with real customer traffic.
    Hammering it concurrently to save ninety seconds is a bad trade.
    """

    @workflow.run
    async def run(self, interval_minutes: int = 15, max_pages: int = 6) -> int:
        total = 0
        for page in range(1, max_pages + 1):
            written = await workflow.execute_activity(
                Activity.SYNC_CATALOG_PAGE,
                page,
                start_to_close_timeout=timedelta(seconds=60),
                retry_policy=RetryPolicy(maximum_attempts=3),
            )
            total += written
            if written == 0:
                break

        await workflow.sleep(timedelta(minutes=interval_minutes))
        workflow.continue_as_new(args=[interval_minutes, max_pages])
        return total
