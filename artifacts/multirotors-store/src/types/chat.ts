import { z } from "zod";

// ── Zod schemas (used for runtime validation of stored jsonb metadata) ──────

export const InvoiceItemSchema = z.object({
  title: z.string(),
  price: z.number(),
  quantity: z.number(),
  source: z.enum(["store", "external"]),
  variantId: z.string().optional(),
  productUrl: z.string().optional(),
  imageUrl: z.string().optional(),
});

export const InvoiceSchema = z.object({
  items: z.array(InvoiceItemSchema).min(1),
  subtotal: z.number(),
  tax: z.number(),
  shipping: z.number(),
  total: z.number(),
  estimatedDeliveryDays: z.number(),
  currency: z.string(),
});

// ── TypeScript types (inferred from schemas so they stay in sync) ─────────

export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;

export interface DraftOrderInput {
  items: Array<{ type: "shopify" | "external"; variantId?: string; title: string; price: number; quantity: number; imageUrl?: string }>;
  note?: string;
}
