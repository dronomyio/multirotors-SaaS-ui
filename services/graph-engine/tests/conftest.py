from __future__ import annotations

from datetime import UTC, datetime

import pytest

from graph_engine.contracts import (
    AutonomyCapability,
    CatalogComponent,
    CommerceFacts,
    ComponentKind,
    ComponentSpec,
    InventoryState,
    Money,
    SensorModality,
)


def component(
    handle: str,
    kind: ComponentKind,
    *,
    mass_g: float = 100.0,
    power_w: float = 5.0,
    price_cents: int = 100_000,
    available: bool = True,
    **spec_kwargs: object,
) -> CatalogComponent:
    return CatalogComponent(
        handle=handle,
        kind=kind,
        title=handle.replace("-", " ").title(),
        vendor="Test",
        spec=ComponentSpec(
            kind=kind, mass_g=mass_g, typical_power_w=power_w, **spec_kwargs  # type: ignore[arg-type]
        ),
        commerce=CommerceFacts(
            variant_id=f"v-{handle}",
            sku=handle.upper(),
            price=Money(amount=price_cents),
            available_for_sale=available,
            inventory=InventoryState.IN_STOCK if available else InventoryState.BACKORDER,
        ),
    )


@pytest.fixture
def platform() -> CatalogComponent:
    """A mid-size inspection airframe: 2.2 kg dry, 6 kg MTOW, 350 W hover."""
    return component(
        "mr-x10",
        ComponentKind.PLATFORM,
        mass_g=2200.0,
        power_w=0.0,
        price_cents=450_000,
        max_takeoff_mass_g=6000.0,
        hover_power_w=350.0,
        diagonal_mm=900.0,
    )


@pytest.fixture
def compute() -> CatalogComponent:
    return component(
        "voxl2",
        ComponentKind.COMPUTE,
        mass_g=16.0,
        power_w=8.0,
        price_cents=129_900,
        peak_power_w=15.0,
        camera_ports=4,
        supported_autonomy=[AutonomyCapability.VIO, AutonomyCapability.SLAM],
    )


@pytest.fixture
def battery() -> CatalogComponent:
    return component(
        "tattu-16000",
        ComponentKind.BATTERY,
        mass_g=1800.0,
        power_w=0.0,
        price_cents=49_900,
        capacity_wh=355.0,
    )


@pytest.fixture
def thermal() -> CatalogComponent:
    return component(
        "flir-boson",
        ComponentKind.SENSOR,
        mass_g=95.0,
        power_w=3.0,
        price_cents=299_900,
        modality=SensorModality.THERMAL,
        interface="csi",
    )


@pytest.fixture
def now_iso() -> str:
    return datetime(2026, 8, 11, tzinfo=UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
