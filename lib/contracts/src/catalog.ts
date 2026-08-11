import { z } from "zod/v4";
import {
  ComponentHandle,
  Grams,
  Millimeters,
  Money,
  ShopifyProductGid,
  ShopifyVariantGid,
  Watts,
  WattHours,
} from "./primitives";

/**
 * The catalog layer. Every value here originates from Shopify (commerce) or
 * Neo4j (engineering). Nothing in this file may be produced by a model.
 */

export const ComponentKind = z.enum([
  "platform", // airframe / full aircraft
  "compute", // VOXL2, Jetson Orin NX, ...
  "flight_controller", // PX4, ArduPilot boards
  "sensor", // thermal, stereo, lidar, gnss
  "radio", // datalink / telemetry
  "battery",
  "gimbal",
  "mount", // payload mounts, adapters
  "software", // autonomy stacks, licenses
]);
export type ComponentKind = z.infer<typeof ComponentKind>;

export const SensorModality = z.enum([
  "thermal",
  "rgb",
  "stereo",
  "lidar",
  "gnss",
  "rtk",
  "multispectral",
  "radar",
]);
export type SensorModality = z.infer<typeof SensorModality>;

export const AutonomyCapability = z.enum([
  "vio", // visual-inertial odometry — the GPS-denied workhorse
  "slam",
  "obstacle_avoidance",
  "inspection",
  "waypoint",
  "precision_landing",
  "follow_me",
]);
export type AutonomyCapability = z.infer<typeof AutonomyCapability>;

// ---------------------------------------------------------------------------
// Kind-specific specs
// ---------------------------------------------------------------------------

const PlatformSpec = z
  .object({
    kind: z.literal("platform"),
    dryMassG: Grams,
    /** Manufacturer max takeoff mass. The hard ceiling for payload math. */
    maxTakeoffMassG: Grams,
    diagonalMm: Millimeters,
    /** Usable payload bays / mount points. */
    mountPoints: z.array(ComponentHandle).default([]),
    hoverPowerW: Watts,
    ipRating: z.string().nullable().default(null),
  })
  .strict();

const ComputeSpec = z
  .object({
    kind: z.literal("compute"),
    massG: Grams,
    typicalPowerW: Watts,
    peakPowerW: Watts,
    /** Camera/CSI lanes available — a real constraint people forget. */
    cameraPorts: z.number().int().nonnegative(),
    tops: z.number().nonnegative().nullable().default(null),
    ramGb: z.number().nonnegative(),
    supportedAutonomy: z.array(AutonomyCapability).default([]),
  })
  .strict();

const FlightControllerSpec = z
  .object({
    kind: z.literal("flight_controller"),
    massG: Grams,
    firmware: z.enum(["px4", "ardupilot", "proprietary"]),
    typicalPowerW: Watts,
  })
  .strict();

const SensorSpec = z
  .object({
    kind: z.literal("sensor"),
    massG: Grams,
    typicalPowerW: Watts,
    modality: SensorModality,
    interface: z.enum(["usb3", "csi", "gmsl2", "ethernet", "uart", "can"]),
    /** Radiometric thermal vs. non-radiometric materially changes inspection value. */
    radiometric: z.boolean().nullable().default(null),
  })
  .strict();

const BatterySpec = z
  .object({
    kind: z.literal("battery"),
    massG: Grams,
    capacityWh: WattHours,
    cells: z.number().int().positive(),
  })
  .strict();

const GenericSpec = z
  .object({
    kind: z.enum(["radio", "gimbal", "mount", "software"]),
    massG: Grams,
    typicalPowerW: Watts,
  })
  .strict();

export const ComponentSpec = z.discriminatedUnion("kind", [
  PlatformSpec,
  ComputeSpec,
  FlightControllerSpec,
  SensorSpec,
  BatterySpec,
  GenericSpec,
]);
export type ComponentSpec = z.infer<typeof ComponentSpec>;

// ---------------------------------------------------------------------------
// Commerce facts — Shopify is truth
// ---------------------------------------------------------------------------

export const InventoryState = z.enum(["in_stock", "backorder", "made_to_order", "discontinued"]);
export type InventoryState = z.infer<typeof InventoryState>;

export const CommerceFacts = z
  .object({
    productId: ShopifyProductGid,
    variantId: ShopifyVariantGid,
    sku: z.string().min(1),
    price: Money,
    compareAtPrice: Money.nullable().default(null),
    availableForSale: z.boolean(),
    inventory: InventoryState,
    quantityAvailable: z.number().int().nonnegative().nullable().default(null),
    leadTimeDays: z.number().int().nonnegative().nullable().default(null),
  })
  .strict();
export type CommerceFacts = z.infer<typeof CommerceFacts>;

// ---------------------------------------------------------------------------
// The joined view the rest of the system consumes
// ---------------------------------------------------------------------------

export const CatalogComponent = z
  .object({
    handle: ComponentHandle,
    kind: ComponentKind,
    title: z.string().min(1),
    vendor: z.string().min(1),
    /** Short marketing blurb from Shopify. Safe to render, never load-bearing. */
    summary: z.string().default(""),
    imageUrl: z.string().url().nullable().default(null),
    spec: ComponentSpec,
    commerce: CommerceFacts,
    /** Graph tags used for retrieval, e.g. ["gps-denied", "solar-inspection"]. */
    missionTags: z.array(z.string()).default([]),
  })
  .strict()
  .refine((c) => c.spec.kind === c.kind, {
    message: "component.kind must match component.spec.kind",
    path: ["spec", "kind"],
  });
export type CatalogComponent = z.infer<typeof CatalogComponent>;
