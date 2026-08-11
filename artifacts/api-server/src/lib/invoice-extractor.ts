import { InvoiceSchema } from "@workspace/api-zod";
import type { Invoice } from "@workspace/api-zod";
import { logger } from "./logger";

export type { Invoice };

/**
 * Parses the `__INVOICE__ … __INVOICE__` block produced by the AI agent,
 * validates it against the shared InvoiceSchema, and returns either a typed
 * Invoice or null (with a warning log) when the payload is missing or invalid.
 *
 * Keeping this in its own module (no OpenAI/Shopify imports) allows it to be
 * unit-tested without mocking heavy dependencies.
 */
export function extractInvoice(raw: string): { text: string; invoice: Invoice | null } {
  const match = raw.match(/__INVOICE__\n([\s\S]*?)\n__INVOICE__/);
  if (!match) return { text: raw.trim(), invoice: null };

  const text = raw
    .replace(/__INVOICE__\n[\s\S]*?\n__INVOICE__/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    logger.warn("Failed to parse invoice JSON from agent response");
    return { text: raw.trim(), invoice: null };
  }

  const result = InvoiceSchema.safeParse(parsed);
  if (!result.success) {
    logger.warn(
      { errors: result.error.flatten() },
      "Invoice failed schema validation — discarding malformed payload"
    );
    return { text, invoice: null };
  }

  return { text, invoice: result.data };
}
