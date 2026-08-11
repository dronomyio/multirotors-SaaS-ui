"""Derive compatibility from the ontology instead of curating O(n²) edges.

Pure functions over facts the graph already holds. No driver, no clock — same
discipline as ``graph.rules``, for the same reasons.

The output is deliberately *graded*. A customer spending $7,000 deserves to know
the difference between "we bench-tested this pair" and "the connectors match, so
it should work". Collapsing those into one boolean is how you end up promising
something you never verified.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from enum import StrEnum

from graph_engine.ontology.schema import expand_mission


class Evidence(StrEnum):
    """How we know. Ordered weakest to strongest."""

    #: No interface overlap and no curated edge — we simply don't know.
    UNKNOWN = "unknown"
    #: Interfaces and capabilities line up. Plausible, untested.
    INFERRED = "inferred"
    #: Someone bench-tested it and signed the edge.
    VERIFIED = "verified"
    #: Explicitly known not to work.
    REFUTED = "refuted"


@dataclass(frozen=True)
class ComponentFacts:
    """The ontology view of one component, as read from the graph."""

    handle: str
    kind: str
    #: interface name -> how many of that port it offers (a hub offers many).
    provides_interfaces: dict[str, int]
    #: interface name -> how many it needs.
    consumes_interfaces: dict[str, int]
    provides_capabilities: frozenset[str]
    missions: frozenset[str] = frozenset()


@dataclass(frozen=True)
class PairVerdict:
    a: str
    b: str
    evidence: Evidence
    #: Human-readable, generated from the rule — never model prose.
    reason: str
    #: Interfaces that actually connect the two.
    via: tuple[str, ...] = ()


def pair_verdict(
    a: ComponentFacts,
    b: ComponentFacts,
    *,
    curated_verified: bool = False,
    curated_refuted: bool = False,
    curated_reason: str | None = None,
) -> PairVerdict:
    """Grade one pair. Curated edges always beat inference."""
    if curated_refuted:
        return PairVerdict(
            a.handle, b.handle, Evidence.REFUTED,
            curated_reason or "Explicitly marked incompatible.",
        )
    if curated_verified:
        return PairVerdict(
            a.handle, b.handle, Evidence.VERIFIED,
            curated_reason or "Bench-tested together.",
        )

    # Either direction counts: a compute providing CSI serves a sensor consuming it.
    links = sorted(
        (set(a.provides_interfaces) & set(b.consumes_interfaces))
        | (set(b.provides_interfaces) & set(a.consumes_interfaces))
    )
    if links:
        return PairVerdict(
            a.handle, b.handle, Evidence.INFERRED,
            f"Interfaces match on {', '.join(links)}; not individually bench-tested.",
            tuple(links),
        )

    # Two sensors never connect to each other — that is not a compatibility
    # problem, so don't report it as unknown and drag confidence down.
    if not a.consumes_interfaces and not b.consumes_interfaces:
        return PairVerdict(
            a.handle, b.handle, Evidence.INFERRED,
            "Neither component consumes an interface from the other; no conflict.",
        )

    return PairVerdict(
        a.handle, b.handle, Evidence.UNKNOWN,
        "No shared interface and no test record.",
    )


@dataclass(frozen=True)
class PortBudget:
    """Whether the build's interface demand actually fits its supply."""

    interface: str
    provided: int
    consumed: int

    @property
    def satisfied(self) -> bool:
        return self.consumed <= self.provided


def port_budgets(components: list[ComponentFacts]) -> list[PortBudget]:
    """Aggregate supply and demand per interface across the whole build.

    Pairwise checking misses the interesting failure: four CSI cameras each
    individually compatible with a compute that has three ports.
    """
    provided: Counter[str] = Counter()
    consumed: Counter[str] = Counter()
    for c in components:
        provided.update(c.provides_interfaces)
        consumed.update(c.consumes_interfaces)

    return [
        PortBudget(interface=name, provided=provided.get(name, 0), consumed=count)
        for name, count in sorted(consumed.items())
    ]


@dataclass(frozen=True)
class MissionFit:
    mission: str
    required: frozenset[str]
    satisfied: frozenset[str]
    missing: frozenset[str]

    @property
    def complete(self) -> bool:
        return not self.missing

    @property
    def coverage(self) -> float:
        return len(self.satisfied) / len(self.required) if self.required else 1.0


def mission_fit(mission: str, components: list[ComponentFacts]) -> MissionFit:
    """Does this build actually do the job the customer described?

    Uses the transitive closure, so asking for solar inspection surfaces the
    ``gnss_positioning`` dependency the customer never mentioned.
    """
    required = expand_mission(mission)
    have: set[str] = set()
    for c in components:
        have |= set(c.provides_capabilities)

    satisfied = required & have
    return MissionFit(
        mission=mission,
        required=required,
        satisfied=frozenset(satisfied),
        missing=frozenset(required - satisfied),
    )


def confidence_from_verdicts(verdicts: list[PairVerdict]) -> float:
    """Weighted confidence. Inference is worth real credit, but not full marks.

    A build of entirely inferred pairs should not read as 100% verified — that
    would erase exactly the distinction this module exists to preserve.
    """
    if not verdicts:
        return 1.0
    weights = {
        Evidence.VERIFIED: 1.0,
        Evidence.INFERRED: 0.6,
        Evidence.UNKNOWN: 0.0,
        Evidence.REFUTED: 0.0,
    }
    return round(sum(weights[v.evidence] for v in verdicts) / len(verdicts), 4)
