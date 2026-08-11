"""OpenTelemetry tracing, exported to Arize (cloud) or Phoenix (local).

Both speak OTLP, so this is one exporter with different headers rather than two
integrations. `OTEL_EXPORTER_OTLP_ENDPOINT` picks the target:

    local dev   http://phoenix:6006/v1/traces      (docker compose default)
    Arize AX    https://otlp.arize.com/v1/traces   + ARIZE_SPACE_ID / ARIZE_API_KEY

What is worth tracing here is not "did the HTTP call succeed" — Temporal already
records that. It is the **decision path**: which components the graph proposed,
what the ontology inferred versus verified, and whether the price the customer
saw came from a fresh cache read. When someone asks "why did it recommend that?"
three weeks later, these attributes are the answer.

Span attributes follow OpenInference conventions where they apply, so Arize's
LLM views light up without custom mapping.
"""

from __future__ import annotations

import os
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from typing import Any

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

SERVICE_NAME = "multirotors-graph-engine"

_configured = False


def configure_tracing(*, console_fallback: bool = True) -> trace.Tracer:
    """Idempotent. Safe to call from the worker and from each activity."""
    global _configured
    if _configured:
        return trace.get_tracer(SERVICE_NAME)

    resource = Resource.create(
        {
            "service.name": os.environ.get("OTEL_SERVICE_NAME", SERVICE_NAME),
            "service.version": os.environ.get("SERVICE_VERSION", "0.1.0"),
            "deployment.environment": os.environ.get("ENVIRONMENT", "development"),
            # Arize groups traces by model id/version; without these, every run
            # lands in one undifferentiated bucket.
            "model_id": os.environ.get("ARIZE_MODEL_ID", "multirotors-configurator"),
            "model_version": os.environ.get("ARIZE_MODEL_VERSION", "0.1.0"),
        }
    )
    provider = TracerProvider(resource=resource)

    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if endpoint:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

        headers: dict[str, str] = {}
        space_id = os.environ.get("ARIZE_SPACE_ID")
        api_key = os.environ.get("ARIZE_API_KEY")
        if space_id and api_key:
            headers = {"space_id": space_id, "api_key": api_key}

        provider.add_span_processor(
            BatchSpanProcessor(
                OTLPSpanExporter(endpoint=_traces_url(endpoint), headers=headers or None)
            )
        )
    elif console_fallback:
        # Better than silently dropping spans and wondering where they went.
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))

    trace.set_tracer_provider(provider)
    _configured = True
    return trace.get_tracer(SERVICE_NAME)


def _traces_url(endpoint: str) -> str:
    return endpoint if endpoint.rstrip("/").endswith("/v1/traces") else (
        endpoint.rstrip("/") + "/v1/traces"
    )


def tracer() -> trace.Tracer:
    return trace.get_tracer(SERVICE_NAME)


# ── Domain-specific spans ─────────────────────────────────────────────────────


@contextmanager
def span_component_search(
    *, mission: str, kinds: Sequence[str], strategy: str
) -> Iterator[trace.Span]:
    with tracer().start_as_current_span("component.search") as span:
        span.set_attribute("mission", mission)
        span.set_attribute("component.kinds", list(kinds))
        span.set_attribute("search.strategy", strategy)
        yield span


def record_search_results(
    span: trace.Span, *, graph: Sequence[str], vector: Sequence[str], fused: Sequence[str]
) -> None:
    """Record all three lists, not just the winner.

    When a customer complains the assistant missed an obvious product, the
    useful question is *which retriever missed it* — the graph, the vector
    index, or the fusion. Logging only the final list makes that unanswerable.
    """
    span.set_attribute("search.graph.count", len(graph))
    span.set_attribute("search.vector.count", len(vector))
    span.set_attribute("search.fused.count", len(fused))
    span.set_attribute("search.graph.handles", list(graph)[:20])
    span.set_attribute("search.vector.handles", list(vector)[:20])
    span.set_attribute("search.fused.handles", list(fused)[:20])
    only_vector = [h for h in vector if h not in set(graph)]
    span.set_attribute("search.vector_only.handles", only_vector[:20])


@contextmanager
def span_assessment(*, handles: Sequence[str]) -> Iterator[trace.Span]:
    with tracer().start_as_current_span("engineering.assess") as span:
        span.set_attribute("component.handles", list(handles))
        span.set_attribute("component.count", len(handles))
        yield span


def record_assessment(
    span: trace.Span,
    *,
    status: str,
    confidence: float,
    verified_pairs: int,
    inferred_pairs: int,
    unknown_pairs: int,
    ruleset_version: str,
) -> None:
    span.set_attribute("assessment.status", status)
    span.set_attribute("assessment.confidence", confidence)
    # The split is the point: a build that is 90% *inferred* is a different
    # product claim than one that is 90% bench-verified.
    span.set_attribute("assessment.pairs.verified", verified_pairs)
    span.set_attribute("assessment.pairs.inferred", inferred_pairs)
    span.set_attribute("assessment.pairs.unknown", unknown_pairs)
    span.set_attribute("assessment.ruleset_version", ruleset_version)


@contextmanager
def span_pricing(*, handles: Sequence[str], max_age_seconds: int) -> Iterator[trace.Span]:
    with tracer().start_as_current_span("commerce.price") as span:
        span.set_attribute("component.handles", list(handles))
        span.set_attribute("price.max_age_seconds", max_age_seconds)
        yield span


def record_pricing(
    span: trace.Span, *, subtotal_minor: int, cache_age_seconds: float, purchasable: bool
) -> None:
    span.set_attribute("price.subtotal_minor", subtotal_minor)
    span.set_attribute("price.cache_age_seconds", cache_age_seconds)
    span.set_attribute("price.purchasable", purchasable)


def record_contract_violation(code: str, detail: Any = None) -> None:
    """A model that tried to emit a fact. Rare, and worth alerting on."""
    span = trace.get_current_span()
    span.set_attribute("contract.violation.code", code)
    if detail is not None:
        span.set_attribute("contract.violation.detail", str(detail)[:1000])
    span.set_status(trace.Status(trace.StatusCode.ERROR, f"contract violation: {code}"))
