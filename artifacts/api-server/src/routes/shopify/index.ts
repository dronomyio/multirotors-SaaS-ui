import { Router, type IRouter } from "express";
import { createShopifyDraftOrder, getProductCollections, type DraftOrderLineItem } from "../../lib/shopify-client";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

// Return the collections a product belongs to, identified by its handle.
// Uses the Shopify Storefront GraphQL API which correctly supports collection
// membership lookups (the public REST endpoint ignores product_id filters).
router.get(
  "/products/:handle/collections",
  async (req, res): Promise<void> => {
    const { handle } = req.params as { handle: string };
    if (!handle) {
      res.status(400).json({ error: "handle is required" });
      return;
    }
    try {
      const collections = await getProductCollections(handle);
      res.json({ collections });
    } catch (err) {
      logger.error({ err }, "Failed to fetch product collections");
      res.status(503).json({ error: "Failed to fetch product collections" });
    }
  }
);

router.post(
  "/openai/conversations/:id/draft-order",
  async (req, res): Promise<void> => {
    const { items, note } = req.body as {
      items?: DraftOrderLineItem[];
      note?: string;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "items array is required" });
      return;
    }

    // Validate each item
    for (const item of items) {
      if (!item.title || typeof item.price !== "number" || !item.quantity) {
        res.status(400).json({ error: "Each item must have title, price, and quantity" });
        return;
      }
    }

    try {
      const result = await createShopifyDraftOrder(items, note);
      res.json(result);
    } catch (err) {
      logger.error({ err }, "Failed to create draft order");
      res.status(503).json({ error: "Failed to create Shopify draft order. Please try again." });
    }
  }
);

export default router;
