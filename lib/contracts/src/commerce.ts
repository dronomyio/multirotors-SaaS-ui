import { z } from "zod/v4";
import { InventoryState } from "./catalog";
import { ComponentHandle, Money, ShopifyVariantGid } from "./primitives";

/**
 * Commerce truth. Every field is read from Shopify at quote time and stamped
 * with `pricedAt`. The frontend renders these numbers; it never derives them.
 */

export const BomLine = z
  .object({
    handle: ComponentHandle,
    variantId: ShopifyVariantGid,
    sku: z.string().min(1),
    title: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPrice: Money,
    lineTotal: Money,
    inventory: InventoryState,
    availableForSale: z.boolean(),
    leadTimeDays: z.number().int().nonnegative().nullable().default(null),
    /** Model prose explaining why this line is in the build. Display only. */
    rationale: z.string().max(400).default(""),
  })
  .strict();
export type BomLine = z.infer<typeof BomLine>;

export const CommerceQuote = z
  .object({
    lines: z.array(BomLine).min(1),
    subtotal: Money,
    /** Null until Shopify calculates it at checkout — we do not guess tax or shipping. */
    estimatedTax: Money.nullable().default(null),
    estimatedShipping: Money.nullable().default(null),
    total: Money,
    currency: z.string().length(3),
    /** True when every line is availableForSale. Gates the checkout CTA. */
    purchasable: z.boolean(),
    /** Longest lead time across lines — the real "when can I fly it" answer. */
    maxLeadTimeDays: z.number().int().nonnegative().nullable().default(null),
    pricedAt: z.string().datetime(),
    /** Shopify cart, created only when the user acts. Never pre-created by the model. */
    cartId: z.string().nullable().default(null),
    checkoutUrl: z.string().url().nullable().default(null),
  })
  .strict()
  .refine((q) => q.total.amount >= q.subtotal.amount, {
    message: "total must be at least subtotal",
    path: ["total"],
  })
  .refine((q) => q.purchasable === q.lines.every((l) => l.availableForSale), {
    message: "purchasable must equal the conjunction of line availability",
    path: ["purchasable"],
  });
export type CommerceQuote = z.infer<typeof CommerceQuote>;
