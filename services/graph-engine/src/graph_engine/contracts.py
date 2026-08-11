"""Pydantic mirrors of the TypeScript contracts in ``lib/contracts``.

TypeScript is the source of truth: the UI and the Mastra agent consume those
types directly and break at compile time if they change. Python asserts
agreement at test time against ``lib/contracts/dist-wire/schema.json``.

Two conventions make the boundary survivable:

1. **Wire format is camelCase, Python is snake_case.** Every model uses
   ``alias_generator=to_camel`` with ``populate_by_name=True``, so
   ``payload_kg`` serialises as ``payloadKg`` and either spelling parses. Nobody
   has to write camelCase attribute names in Python to keep JavaScript happy.

2. **Money is integer minor units.** Same rule as the TypeScript side, for the
   same reason: ``subtotal * 0.085`` on floats produces customer-visible
   nonsense, and Python's float is exactly as bad as JavaScript's.

``extra="forbid"`` throughout, mirroring ``.strict()`` in Zod. An unexpected
field means the two sides have drifted, and that should be loud.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel


class Wire(BaseModel):
    """Base for everything crossing the language boundary."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        frozen=True,
    )


# ── Money ─────────────────────────────────────────────────────────────────────

Currency = Literal["USD", "EUR", "GBP", "CAD", "AUD"]


class Money(Wire):
    """Integer minor units. Never a float, never a Decimal on the wire."""

    amount: int
    currency: Currency = "USD"

    def __add__(self, other: Money) -> Money:
        if self.currency != other.currency:
            raise ValueError(f"cannot add {other.currency} to {self.currency}")
        return Money(amount=self.amount + other.amount, currency=self.currency)

    def times(self, qty: int) -> Money:
        return Money(amount=self.amount * qty, currency=self.currency)

    def format(self) -> str:
        return f"${self.amount / 100:,.2f}" if self.currency == "USD" else f"{self.amount / 100:,.2f} {self.currency}"


def money(amount_minor: int, currency: Currency = "USD") -> Money:
    return Money(amount=amount_minor, currency=currency)


def cents_from_decimal_string(raw: str) -> int | None:
    """Parse Shopify's ``"1299.00"`` without ever touching a float."""
    try:
        d = Decimal(raw.strip())
    except (ArithmeticError, ValueError):
        return None
    if d < 0:
        return None
    return int((d * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def apply_rate_bps(amount_minor: int, rate_bps: int) -> int:
    """Percentages as basis points, so tax stays in integer arithmetic."""
    return int(
        (Decimal(amount_minor) * Decimal(rate_bps) / Decimal(10_000)).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )


# ── Enumerations (mirror the Zod enums exactly) ───────────────────────────────


class ComponentKind(StrEnum):
    PLATFORM = "platform"
    COMPUTE = "compute"
    FLIGHT_CONTROLLER = "flight_controller"
    SENSOR = "sensor"
    RADIO = "radio"
    BATTERY = "battery"
    GIMBAL = "gimbal"
    MOUNT = "mount"
    SOFTWARE = "software"


class SensorModality(StrEnum):
    THERMAL = "thermal"
    RGB = "rgb"
    STEREO = "stereo"
    LIDAR = "lidar"
    GNSS = "gnss"
    RTK = "rtk"
    MULTISPECTRAL = "multispectral"
    RADAR = "radar"


class AutonomyCapability(StrEnum):
    VIO = "vio"
    SLAM = "slam"
    OBSTACLE_AVOIDANCE = "obstacle_avoidance"
    INSPECTION = "inspection"
    WAYPOINT = "waypoint"
    PRECISION_LANDING = "precision_landing"
    FOLLOW_ME = "follow_me"


class InventoryState(StrEnum):
    IN_STOCK = "in_stock"
    BACKORDER = "backorder"
    MADE_TO_ORDER = "made_to_order"
    DISCONTINUED = "discontinued"


class RuleSeverity(StrEnum):
    BLOCKER = "blocker"
    WARNING = "warning"
    INFO = "info"


class AssessmentStatus(StrEnum):
    COMPATIBLE = "compatible"
    COMPATIBLE_WITH_WARNINGS = "compatible_with_warnings"
    INCOMPATIBLE = "incompatible"
    INCOMPLETE = "incomplete"


Handle = Annotated[str, Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=2, max_length=80)]


# ── Catalog ───────────────────────────────────────────────────────────────────


class ComponentSpec(Wire):
    """Flattened union of the kind-specific specs on the TypeScript side.

    Kept flat deliberately: a discriminated union here would force every Cypher
    projection to branch, and the graph stores these as node properties anyway.
    ``kind`` still says which fields are meaningful.
    """

    kind: ComponentKind
    mass_g: float = Field(ge=0)
    typical_power_w: float = Field(default=0.0, ge=0)

    # platform
    max_takeoff_mass_g: float | None = Field(default=None, ge=0)
    hover_power_w: float | None = Field(default=None, ge=0)
    diagonal_mm: float | None = Field(default=None, ge=0)
    # compute
    peak_power_w: float | None = Field(default=None, ge=0)
    camera_ports: int | None = Field(default=None, ge=0)
    supported_autonomy: list[AutonomyCapability] = Field(default_factory=list)
    # sensor
    modality: SensorModality | None = None
    interface: str | None = None
    # battery
    capacity_wh: float | None = Field(default=None, ge=0)
    # flight controller
    firmware: str | None = None


class CommerceFacts(Wire):
    """Shopify is authoritative for every field here."""

    variant_id: str
    sku: str
    price: Money
    available_for_sale: bool
    inventory: InventoryState = InventoryState.IN_STOCK
    lead_time_days: int | None = Field(default=None, ge=0)


class CatalogComponent(Wire):
    handle: Handle
    kind: ComponentKind
    title: str = Field(min_length=1)
    vendor: str = ""
    summary: str = ""
    image_url: str | None = None
    spec: ComponentSpec
    commerce: CommerceFacts
    mission_tags: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _kind_matches_spec(self) -> CatalogComponent:
        if self.kind != self.spec.kind:
            raise ValueError(f"component.kind {self.kind!r} != spec.kind {self.spec.kind!r}")
        return self


# ── Engineering assessment ────────────────────────────────────────────────────


class CompatibilityFinding(Wire):
    rule_id: str
    severity: RuleSeverity
    subjects: list[Handle]
    message: str
    remedies: list[Handle] = Field(default_factory=list)


class MassBudget(Wire):
    platform_dry_g: float
    payload_g: float
    battery_g: float
    total_g: float
    max_takeoff_g: float
    utilization: float
    headroom_g: float


class PowerBudget(Wire):
    hover_w: float
    avionics_w: float
    payload_w: float
    total_w: float
    estimated_flight_minutes: float
    model: Literal["linear_wh_over_w", "vendor_curve", "empirical_lookup"]
    confidence_minutes: float


class EngineeringAssessment(Wire):
    status: AssessmentStatus
    findings: list[CompatibilityFinding] = Field(default_factory=list)
    mass: MassBudget
    power: PowerBudget
    compatibility_confidence: float = Field(ge=0, le=1)
    unverified_pairs: list[tuple[Handle, Handle]] = Field(default_factory=list)
    computed_at: str
    ruleset_version: str

    @model_validator(mode="after")
    def _incompatible_needs_blocker(self) -> EngineeringAssessment:
        if self.status is AssessmentStatus.INCOMPATIBLE and not any(
            f.severity is RuleSeverity.BLOCKER for f in self.findings
        ):
            raise ValueError("status 'incompatible' requires at least one blocker finding")
        return self


# ── Commerce ──────────────────────────────────────────────────────────────────


class BomLine(Wire):
    handle: Handle
    variant_id: str
    sku: str
    title: str
    quantity: int = Field(gt=0)
    unit_price: Money
    line_total: Money
    inventory: InventoryState
    available_for_sale: bool
    lead_time_days: int | None = None
    rationale: str = ""


class CommerceQuote(Wire):
    lines: list[BomLine] = Field(min_length=1)
    subtotal: Money
    estimated_tax: Money | None = None
    estimated_shipping: Money | None = None
    total: Money
    currency: str = "USD"
    purchasable: bool
    max_lead_time_days: int | None = None
    priced_at: str
    cart_id: str | None = None
    checkout_url: str | None = None

    @model_validator(mode="after")
    def _invariants(self) -> CommerceQuote:
        if self.total.amount < self.subtotal.amount:
            raise ValueError("total must be at least subtotal")
        if self.purchasable != all(line.available_for_sale for line in self.lines):
            raise ValueError("purchasable must equal the conjunction of line availability")
        return self


# ── Activity payloads ─────────────────────────────────────────────────────────


class SearchCandidatesInput(Wire):
    mission: str
    kinds: list[ComponentKind] = Field(default_factory=list)
    required_modalities: list[SensorModality] = Field(default_factory=list)
    required_autonomy: list[AutonomyCapability] = Field(default_factory=list)
    budget_max_minor: int | None = None
    limit: int = Field(default=12, ge=1, le=48)


class ResolveComponentsInput(Wire):
    handles: list[Handle]


class ResolveComponentsOutput(Wire):
    components: list[CatalogComponent] = Field(default_factory=list)
    #: Handles the graph does not know. Never silently dropped.
    missing: list[str] = Field(default_factory=list)


class AssessCompatibilityInput(Wire):
    handles: list[Handle]


class PriceConfigurationInput(Wire):
    lines: list[tuple[Handle, int]]
    max_age_seconds: int = 300


class ConfigurationState(Wire):
    """What the workflow holds and the ``currentConfiguration`` query returns."""

    configuration_id: str
    session_id: str
    mission: str = "unspecified"
    selections: dict[str, int] = Field(default_factory=dict)
    engineering: EngineeringAssessment | None = None
    commerce: CommerceQuote | None = None
    revision: int = 0
    updated_at: str = ""
