import { z } from "zod/v4";

/**
 * Primitives shared by every layer.
 *
 * Rule: money is ALWAYS integer minor units. Floats are banned at the schema
 * level so a model (or a careless `parseFloat`) can never introduce $6430.0000001
 * into a cart line.
 */

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/** Shopify global ID, e.g. "gid://shopify/ProductVariant/44120983". */
export const ShopifyVariantGid = z
  .string()
  .regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/, "expected a Shopify ProductVariant GID")
  .brand<"ShopifyVariantGid">();
export type ShopifyVariantGid = z.infer<typeof ShopifyVariantGid>;

export const ShopifyProductGid = z
  .string()
  .regex(/^gid:\/\/shopify\/Product\/\d+$/, "expected a Shopify Product GID")
  .brand<"ShopifyProductGid">();
export type ShopifyProductGid = z.infer<typeof ShopifyProductGid>;

/**
 * Stable handle for a node in the engineering graph. This is the ONLY component
 * identifier the language model is ever allowed to emit — it cannot emit a
 * variant GID, a SKU, or a price.
 */
export const ComponentHandle = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "handles are lowercase kebab-case")
  .min(2)
  .max(80)
  .brand<"ComponentHandle">();
export type ComponentHandle = z.infer<typeof ComponentHandle>;

export const ConfigurationId = z.string().uuid().brand<"ConfigurationId">();
export type ConfigurationId = z.infer<typeof ConfigurationId>;

export const SessionId = z.string().uuid().brand<"SessionId">();
export type SessionId = z.infer<typeof SessionId>;

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export const CurrencyCode = z.enum(["USD", "EUR", "GBP", "CAD", "AUD"]);
export type CurrencyCode = z.infer<typeof CurrencyCode>;

export const Money = z
  .object({
    /** Minor units (cents). Integer, never a float. */
    amount: z.number().int(),
    currency: CurrencyCode,
  })
  .strict();
export type Money = z.infer<typeof Money>;

export const money = (amountMinor: number, currency: CurrencyCode = "USD"): Money => {
  if (!Number.isInteger(amountMinor)) {
    throw new TypeError(`Money.amount must be an integer in minor units, received ${amountMinor}`);
  }
  return { amount: amountMinor, currency };
};

export const addMoney = (a: Money, b: Money): Money => {
  if (a.currency !== b.currency) {
    throw new TypeError(`cannot add ${a.currency} to ${b.currency}`);
  }
  return { amount: a.amount + b.amount, currency: a.currency };
};

export const sumMoney = (items: readonly Money[], currency: CurrencyCode = "USD"): Money =>
  items.reduce<Money>(addMoney, { amount: 0, currency });

export const formatMoney = (m: Money, locale = "en-US"): string =>
  new Intl.NumberFormat(locale, { style: "currency", currency: m.currency }).format(m.amount / 100);

// ---------------------------------------------------------------------------
// Physical units — named so nobody has to guess whether it's kg or g
// ---------------------------------------------------------------------------

export const Grams = z.number().nonnegative().finite().brand<"Grams">();
export type Grams = z.infer<typeof Grams>;

export const Millimeters = z.number().nonnegative().finite().brand<"Millimeters">();
export type Millimeters = z.infer<typeof Millimeters>;

export const Watts = z.number().nonnegative().finite().brand<"Watts">();
export type Watts = z.infer<typeof Watts>;

export const Minutes = z.number().nonnegative().finite().brand<"Minutes">();
export type Minutes = z.infer<typeof Minutes>;

export const WattHours = z.number().nonnegative().finite().brand<"WattHours">();
export type WattHours = z.infer<typeof WattHours>;

/** A 0..1 score. Used for compatibility confidence; never for money. */
export const UnitInterval = z.number().min(0).max(1);
export type UnitInterval = z.infer<typeof UnitInterval>;

// ---------------------------------------------------------------------------
// Provenance — every field the UI renders carries where it came from
// ---------------------------------------------------------------------------

/**
 * The single most important enum in this package.
 *
 * Anything tagged `model` is a suggestion and must never be treated as fact.
 * The hydration step refuses to emit a resolved state in which a price,
 * SKU, inventory count, or compatibility verdict carries `model` provenance.
 */
export const Provenance = z.enum([
  /** Shopify Admin/Storefront API — authoritative for SKU, price, inventory. */
  "shopify",
  /** Neo4j engineering graph — authoritative for compatibility and specs. */
  "neo4j",
  /** Deterministic server-side computation over shopify+neo4j inputs. */
  "computed",
  /** Language model output. Presentation and prose only. */
  "model",
]);
export type Provenance = z.infer<typeof Provenance>;

export const AUTHORITATIVE_PROVENANCE: readonly Provenance[] = ["shopify", "neo4j", "computed"];

export const isAuthoritative = (p: Provenance): boolean => AUTHORITATIVE_PROVENANCE.includes(p);

/** Wraps a value with its source so the trust boundary can be checked mechanically. */
export const sourced = <T extends z.ZodTypeAny>(inner: T) =>
  z
    .object({
      value: inner,
      source: Provenance,
      /** ISO-8601. How stale the underlying read is. */
      readAt: z.string().datetime(),
    })
    .strict();

export type Sourced<T> = { value: T; source: Provenance; readAt: string };
