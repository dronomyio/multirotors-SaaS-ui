import { z } from "zod";

// ── Invoice Zod schemas ────────────────────────────────────────────────────────
// Single source of truth shared between the API server (write-time validation)
// and the web/mobile clients (read-time validation).

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

export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
