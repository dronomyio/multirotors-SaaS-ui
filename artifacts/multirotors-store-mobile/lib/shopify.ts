/**
 * Shopify catalog helpers for the mobile app.
 * Products are fetched from the public multirotors.store JSON REST endpoints
 * (no auth token required).
 */
import { useQuery } from '@tanstack/react-query';

const BASE = 'https://multirotors.store';

// ─── Categories ───────────────────────────────────────────────────────────────

export interface FeaturedCategory {
  handle: string;
  title: string;
  sub: string;
  img: string;
}

export const FEATURED_CATEGORIES: FeaturedCategory[] = [
  {
    handle: 'enterprise-drones',
    title: 'Blue UAS Drones',
    sub: 'NDAA compliant platforms',
    img: 'https://cdn.shopify.com/s/files/1/0732/4863/7218/collections/1_6Y8tQFckLCbMtd_yN-Gfrg.gif',
  },
  {
    handle: 'robotic',
    title: 'Robotics',
    sub: 'Quadrupeds & AMR platforms',
    img: 'https://cdn.shopify.com/s/files/1/0732/4863/7218/files/d3716d_44a3e1debca44de2812700c7014cdc91_mv2.webp',
  },
  {
    handle: 'lidar',
    title: 'LiDAR Sensors',
    sub: 'Precision ranging & mapping',
    img: 'https://cdn.shopify.com/s/files/1/0732/4863/7218/collections/OS2_2_compact_f1709e23-d8e1-4f05-9629-b0b4144084b3.webp',
  },
  {
    handle: 'fpv-drones',
    title: 'FPV Drones',
    sub: 'Racing & cinematic quads',
    img: 'https://cdn.shopify.com/s/files/1/0732/4863/7218/files/8_f79cab7d-cf0d-4542-9611-78aaa1b1add6.webp',
  },
  {
    handle: 'hd-camera',
    title: 'HD Cameras',
    sub: 'Aerial imaging systems',
    img: 'https://cdn.shopify.com/s/files/1/0732/4863/7218/collections/Screen_Shot_2023-04-04_at_5.30.40_PM_c83cbd4e-688e-452e-a981-69ab7eda30dc.png',
  },
  {
    handle: 'fpv-first-person-view-goggles',
    title: 'FPV Goggles',
    sub: 'Immersive video systems',
    img: 'https://cdn.shopify.com/s/files/1/0732/4863/7218/collections/Screen_Shot_2023-04-04_at_5.22.36_PM_11b6374a-666f-452b-89ee-8ad57822f17c.png',
  },
  {
    handle: 'flight-controller',
    title: 'Flight Controllers',
    sub: 'Autopilot & FMU systems',
    img: 'https://cdn.shopify.com/s/files/1/0732/4863/7218/collections/ZEEZ-F7-2020-V3--33_03c24cb0-8a42-4b81-8ec7-545147110d0d.webp',
  },
  {
    handle: 'batteries',
    title: 'Batteries',
    sub: 'LiPo & Li-ion packs',
    img: 'https://cdn.shopify.com/s/files/1/0732/4863/7218/collections/Image_pg3_2_6a64c417-6400-43fd-8795-5b6ea9768387.webp',
  },
  {
    handle: 'drone-radio-controller',
    title: 'Radio Controllers',
    sub: 'Transmitters & receivers',
    img: 'https://cdn.shopify.com/s/files/1/0732/4863/7218/collections/Screen_Shot_2023-04-04_at_5.27.57_PM_b47bc9ee-ea1f-4c83-b809-3237b1f3ab6e.png',
  },
  {
    handle: 'motors',
    title: 'Motors',
    sub: 'Brushless motor systems',
    img: 'https://cdn.shopify.com/s/files/1/0732/4863/7218/collections/Image_pg4_5_e725ac0d-fe7d-4d99-a852-790792a46d61.webp',
  },
];

// ─── Products ─────────────────────────────────────────────────────────────────

export interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  available: boolean;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  images: Array<{ src: string }>;
  variants: ShopifyVariant[];
}

export function useCollectionProducts(handle: string, page: number, limit = 12) {
  return useQuery({
    queryKey: ['collection-products', handle, page, limit],
    queryFn: async () => {
      const url = `${BASE}/collections/${handle}/products.json?limit=${limit}&page=${page}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch products for ${handle}`);
      const data = (await res.json()) as { products: ShopifyProduct[] };
      return data.products;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchSuggestion {
  handle: string;
  title: string;
  price: string | null;
  imageUrl: string | null;
}

interface SuggestProduct {
  handle: string;
  title: string;
  price: string;
  image?: { src: string } | null;
}

interface SuggestResponse {
  resources: {
    results: {
      products: SuggestProduct[];
    };
  };
}

export function useProductSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['product-search', trimmed],
    queryFn: async (): Promise<SearchSuggestion[]> => {
      if (!trimmed) return [];
      const url =
        `${BASE}/search/suggest.json?q=${encodeURIComponent(trimmed)}` +
        `&resources[type]=product&resources[limit]=15`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Search failed');
      const data = (await res.json()) as SuggestResponse;
      return (data.resources?.results?.products ?? []).map((p) => ({
        handle: p.handle,
        title: p.title,
        price: p.price ?? null,
        imageUrl: p.image?.src ?? null,
      }));
    },
    enabled: trimmed.length > 0,
    staleTime: 30 * 1000,
  });
}
