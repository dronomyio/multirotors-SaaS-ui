/**
 * Shopify client for multirotors.store
 *
 * Product search and collection browsing use Shopify's public JSON API
 * (no authentication required — works on any published Shopify storefront).
 *
 * Checkout uses a direct Shopify cart URL (/cart/{variantId}:{qty},...) built
 * from variant IDs returned by the public API — no Admin API or connector needed.
 */
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  price: number;
  currencyCode: string;
  variantId: string | null;
  availableForSale: boolean;
  imageUrl: string | null;
  productUrl: string;
}

export interface ShopifyCollection {
  handle: string;
  title: string;
  description: string;
}

// ─── Public REST API response shapes ─────────────────────────────────────────

interface RestVariant {
  id: number;
  price: string;
  available: boolean;
}

interface RestProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  variants: RestVariant[];
  images: Array<{ src: string }>;
  currency?: string;
  // Read by searchShopifyProducts for keyword scoring; both are present on the
  // public products.json payload but were previously undeclared, which made
  // `pnpm run typecheck` — and therefore `pnpm run build` — fail.
  product_type?: string;
  vendor?: string;
}

interface RestCollection {
  id: number;
  handle: string;
  title: string;
  description: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The public-facing store domain — no https:// prefix, no trailing slash. */
function storeDomain(): string {
  const raw = process.env.SHOPIFY_STORE_DOMAIN ?? "";
  const cleaned = raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  // Fall back to the known domain if secret is empty or a hash
  return cleaned.includes(".") ? cleaned : "multirotors.store";
}

function mapRestProduct(p: RestProduct): ShopifyProduct {
  const variant = p.variants[0];
  const image = p.images[0];
  const domain = storeDomain();
  // Strip HTML tags from body
  const description = p.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  return {
    id: String(p.id),
    title: p.title,
    handle: p.handle,
    description,
    price: parseFloat(variant?.price ?? "0"),
    currencyCode: "USD",
    variantId: variant ? String(variant.id) : null,
    availableForSale: variant?.available ?? false,
    imageUrl: image?.src ?? null,
    productUrl: `https://${domain}/products/${p.handle}`,
  };
}

async function shopifyGet<T>(path: string): Promise<T | null> {
  const domain = storeDomain();
  const url = `https://${domain}${path}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      logger.warn({ status: response.status, url }, "Shopify public API error");
      return null;
    }
    return await response.json() as T;
  } catch (err) {
    logger.error({ err, url }, "Shopify public API fetch failed");
    return null;
  }
}

// ─── Public search & browse functions ────────────────────────────────────────

export async function searchShopifyProducts(query: string): Promise<ShopifyProduct[]> {
  // Fetch first two pages (up to 500 products) and filter client-side.
  // /search.json is not reliably available on all Shopify themes.
  const pages = await Promise.all([
    shopifyGet<{ products: RestProduct[] }>("/products.json?limit=250"),
    shopifyGet<{ products: RestProduct[] }>("/products.json?limit=250&page=2"),
  ]);

  const all: RestProduct[] = [
    ...(pages[0]?.products ?? []),
    ...(pages[1]?.products ?? []),
  ];

  if (all.length === 0) return [];

  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);

  const scored = all
    .map((p) => {
      const text = [p.title, p.handle, p.product_type ?? "", p.vendor ?? ""]
        .join(" ")
        .toLowerCase();
      const score = terms.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
      return { p, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return scored.map(({ p }) => mapRestProduct(p));
}

// ─── Product → Collection membership lookup ───────────────────────────────────

/**
 * Known featured collections — mirrors FEATURED_CATEGORIES in the web frontend.
 * These are the primary browsing categories that cover the vast majority of
 * products in the store.
 */
const KNOWN_COLLECTIONS: Array<{ handle: string; title: string }> = [
  { handle: "enterprise-drones",               title: "Blue UAS Drones" },
  { handle: "robotic",                          title: "Robotics" },
  { handle: "lidar",                            title: "LiDAR Sensors" },
  { handle: "fpv-drones",                       title: "FPV Drones" },
  { handle: "hd-camera",                        title: "HD Cameras" },
  { handle: "fpv-first-person-view-goggles",    title: "FPV Goggles" },
  { handle: "flight-controller",                title: "Flight Controllers" },
  { handle: "batteries",                        title: "Batteries" },
  { handle: "drone-radio-controller",           title: "Radio Controllers" },
  { handle: "motors",                           title: "Motors" },
];

/**
 * Finds the collections that contain a product (identified by its handle).
 *
 * Shopify's public unauthenticated REST API does not support filtering
 * /collections.json by product_id, and the Storefront Access Token stored
 * in this environment is scoped to the Replit connector sandbox, not to
 * multirotors.store.  The only reliable public approach is to check each
 * known collection's product list in parallel and return any that contain
 * the requested product handle.
 */
export async function getProductCollections(handle: string): Promise<ShopifyCollection[]> {
  const domain = storeDomain();

  const checks = await Promise.all(
    KNOWN_COLLECTIONS.map(async ({ handle: colHandle, title }) => {
      try {
        // Shopify caps /products.json at 250 items per page; most collections
        // have fewer — this single-page check covers the vast majority.
        const response = await fetch(
          `https://${domain}/collections/${colHandle}/products.json?limit=250`,
          { headers: { Accept: "application/json" } }
        );
        if (!response.ok) return null;

        const data = await response.json() as { products: Array<{ handle: string }> };
        const found = (data.products ?? []).some((p) => p.handle === handle);
        if (!found) return null;

        return { handle: colHandle, title, description: "" } satisfies ShopifyCollection;
      } catch {
        return null;
      }
    })
  );

  return checks.filter((c): c is ShopifyCollection => c !== null);
}

export async function listShopifyCollections(): Promise<ShopifyCollection[]> {
  // Use limit=250 to get all collections in a single request (store has ~99)
  const data = await shopifyGet<{ collections: RestCollection[] }>("/collections.json?limit=250");
  return (data?.collections ?? []).map((c) => ({
    handle: c.handle,
    title: c.title,
    description: c.description,
  }));
}

export async function getShopifyCollectionProducts(handle: string): Promise<ShopifyProduct[]> {
  const data = await shopifyGet<{ products: RestProduct[] }>(
    `/collections/${handle}/products.json?limit=12`
  );
  return (data?.products ?? []).map(mapRestProduct);
}

// ─── Cart checkout (direct Shopify cart URL) ─────────────────────────────────

export interface DraftOrderLineItem {
  type: "shopify" | "external";
  variantId?: string | null;
  title: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
}

export interface DraftOrderResponse {
  checkoutUrl: string;
  draftOrderId: string;
}

/**
 * Builds a direct Shopify cart URL for the given items.
 *
 * Uses the format: https://<domain>/cart/<variantId>:<qty>,<variantId>:<qty>
 * This works on any published Shopify storefront without Admin API access.
 *
 * External items (no variantId) are skipped — they cannot be added to a
 * Shopify cart via URL. If there are no Shopify items, returns the store
 * homepage so the customer still lands somewhere sensible.
 */
export async function createShopifyDraftOrder(
  items: DraftOrderLineItem[],
  _note?: string
): Promise<DraftOrderResponse> {
  const domain = storeDomain();

  // Only Shopify-stocked items with a real variant ID can be added via cart URL
  const shopifyItems = items.filter(
    (item) => item.type === "shopify" && item.variantId
  );

  if (shopifyItems.length === 0) {
    logger.warn(
      { itemCount: items.length },
      "No Shopify variant IDs found; redirecting to store homepage"
    );
    return {
      checkoutUrl: `https://${domain}`,
      draftOrderId: "direct",
    };
  }

  // Build /cart/{variantId}:{qty},{variantId}:{qty} permalink
  const cartParts = shopifyItems.map((item) => {
    // Public REST API returns plain numeric IDs; GID format also handled
    const numericId = item.variantId!.split("/").pop()!;
    return `${numericId}:${item.quantity}`;
  });

  const checkoutUrl = `https://${domain}/cart/${cartParts.join(",")}`;
  logger.info({ checkoutUrl, itemCount: shopifyItems.length }, "Built Shopify cart URL");

  return {
    checkoutUrl,
    draftOrderId: "direct",
  };
}
