// ─── Shared Shopify public-API helpers ────────────────────────────────────────
// All reads use the unauthenticated public JSON REST endpoints.
// No token needed — these are publicly available on any Shopify store.

import { useState, useEffect } from "react";

export const STORE_URL = "https://multirotors.store";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  images: Array<{ src: string }>;
  variants: Array<{ id: number; price: string; title: string; available?: boolean }>;
  tags: string;
}

export interface ShopifyCollection {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  image?: { src: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function formatPrice(price: string | number): string {
  const n = typeof price === "string" ? parseFloat(price) : price;
  if (!n || n === 0) return "Contact for Price";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function productUrl(handle: string): string {
  return `${STORE_URL}/products/${handle}`;
}

export function collectionUrl(handle: string): string {
  return `${STORE_URL}/collections/${handle}`;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useCollectionProducts(handle: string, limit = 12, page = 1) {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!handle) return;
    setLoading(true);
    fetch(`${STORE_URL}/collections/${handle}/products.json?limit=${limit}&page=${page}`)
      .then((r) => r.json())
      .then((d) => {
        const prods: ShopifyProduct[] = d.products ?? [];
        setProducts(prods);
        setHasMore(prods.length === limit);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [handle, limit, page]);

  return { products, loading, hasMore };
}

// Fetch the first collection a product belongs to (by product handle).
// Uses the API server which calls the Shopify Storefront GraphQL API — the
// only public Shopify endpoint that correctly exposes product→collection
// membership. The public REST /collections.json endpoint does not filter
// by product_id despite accepting that parameter.
export function useProductCollection(handle: string | null) {
  const [collection, setCollection] = useState<ShopifyCollection | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!handle) return;
    setLoading(true);

    // Route through the API server (which holds the Storefront Access Token).
    // The API is path-routed at /api relative to this app's origin.
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/api/products/${encodeURIComponent(handle)}/collections`)
      .then((r) => {
        if (!r.ok) throw new Error("API error");
        return r.json();
      })
      .then((d: { collections?: ShopifyCollection[] }) => {
        const cols = d.collections ?? [];
        // Skip utility/internal collections and prefer a meaningful one
        const skip = new Set([
          "home-page", "order", "rental", "daas", "raas",
          "control", "collectibles", "rental-service",
        ]);
        const match = cols.find((c) => !skip.has(c.handle)) ?? cols[0] ?? null;
        setCollection(match);
      })
      .catch(() => setCollection(null))
      .finally(() => setLoading(false));
  }, [handle]);

  return { collection, loading };
}

export function useShopifyCollections() {
  const [collections, setCollections] = useState<ShopifyCollection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${STORE_URL}/collections.json?limit=250`)
      .then((r) => r.json())
      .then((d) => {
        const all: ShopifyCollection[] = d.collections ?? [];
        // Keep only collections that have a cover image and aren't internal/utility
        const skip = new Set([
          "home-page", "order", "rental", "daas", "raas",
          "control", "collectibles", "rental-service",
        ]);
        setCollections(all.filter((c) => c.image && !skip.has(c.handle)));
      })
      .catch(() => setCollections([]))
      .finally(() => setLoading(false));
  }, []);

  return { collections, loading };
}

// ─── Pinned featured categories (shown on Home + Shop header) ─────────────────

export interface FeaturedCategory {
  handle: string;
  title: string;
  sub: string;
  img: string;
}

export const FEATURED_CATEGORIES: FeaturedCategory[] = [
  {
    handle: "enterprise-drones",
    title: "Blue UAS Drones",
    sub: "NDAA compliant platforms",
    img: "https://cdn.shopify.com/s/files/1/0732/4863/7218/collections/1_6Y8tQFckLCbMtd_yN-Gfrg.gif",
  },
  {
    handle: "robotic",
    title: "Robotics",
    sub: "Quadrupeds & AMR platforms",
    img: "https://cdn.shopify.com/s/files/1/0732/4863/7218/files/d3716d_44a3e1debca44de2812700c7014cdc91_mv2.webp",
  },
  {
    handle: "lidar",
    title: "LiDAR Sensors",
    sub: "Precision ranging & mapping",
    img: "https://cdn.shopify.com/s/files/1/0732/4863/7218/collections/OS2_2_compact_f1709e23-d8e1-4f05-9629-b0b4144084b3.webp",
  },
  {
    handle: "fpv-drones",
    title: "FPV Drones",
    sub: "Racing & cinematic quads",
    img: "https://cdn.shopify.com/s/files/1/0732/4863/7218/files/8_f79cab7d-cf0d-4542-9611-78aaa1b1add6.webp",
  },
  {
    handle: "hd-camera",
    title: "HD Cameras",
    sub: "Aerial imaging systems",
    img: "https://cdn.shopify.com/s/files/1/0732/4863/7218/collections/Screen_Shot_2023-04-04_at_5.30.40_PM_c83cbd4e-688e-452e-a981-69ab7eda30dc.png",
  },
  {
    handle: "fpv-first-person-view-goggles",
    title: "FPV Goggles",
    sub: "Immersive video systems",
    img: "https://cdn.shopify.com/s/files/1/0732/4863/7218/collections/Screen_Shot_2023-04-04_at_5.22.36_PM_11b6374a-666f-452b-89ee-8ad57822f17c.png",
  },
  {
    handle: "flight-controller",
    title: "Flight Controllers",
    sub: "Autopilot & FMU systems",
    img: "https://cdn.shopify.com/s/files/1/0732/4863/7218/collections/ZEEZ-F7-2020-V3--33_03c24cb0-8a42-4b81-8ec7-545147110d0d.webp",
  },
  {
    handle: "batteries",
    title: "Batteries",
    sub: "LiPo & Li-ion packs",
    img: "https://cdn.shopify.com/s/files/1/0732/4863/7218/collections/Image_pg3_2_6a64c417-6400-43fd-8795-5b6ea9768387.webp",
  },
  {
    handle: "drone-radio-controller",
    title: "Radio Controllers",
    sub: "Transmitters & receivers",
    img: "https://cdn.shopify.com/s/files/1/0732/4863/7218/collections/Screen_Shot_2023-04-04_at_5.27.57_PM_b47bc9ee-ea1f-4c83-b809-3237b1f3ab6e.png",
  },
  {
    handle: "motors",
    title: "Motors",
    sub: "Brushless motor systems",
    img: "https://cdn.shopify.com/s/files/1/0732/4863/7218/collections/Image_pg4_5_e725ac0d-fe7d-4d99-a852-790792a46d61.webp",
  },
];
