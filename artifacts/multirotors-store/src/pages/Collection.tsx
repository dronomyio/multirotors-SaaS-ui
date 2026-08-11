import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useParams, useSearch, useLocation } from "wouter";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductCard, ProductSkeleton } from "@/components/shop/ProductCard";
import {
  useCollectionProducts,
  STORE_URL,
  type ShopifyCollection,
  type ShopifyProduct,
} from "@/lib/shopify";

const PAGE_SIZE = 12;

// ── Sort options ───────────────────────────────────────────────────────────────
export type SortKey = "featured" | "price-asc" | "price-desc" | "title-asc";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "featured",   label: "Featured" },
  { value: "price-asc",  label: "Price: Low → High" },
  { value: "price-desc", label: "Price: High → Low" },
  { value: "title-asc",  label: "A–Z" },
];

function sortProducts(products: ShopifyProduct[], sort: SortKey): ShopifyProduct[] {
  const copy = [...products];
  switch (sort) {
    case "price-asc":
      return copy.sort(
        (a, b) =>
          parseFloat(a.variants[0]?.price ?? "0") -
          parseFloat(b.variants[0]?.price ?? "0")
      );
    case "price-desc":
      return copy.sort(
        (a, b) =>
          parseFloat(b.variants[0]?.price ?? "0") -
          parseFloat(a.variants[0]?.price ?? "0")
      );
    case "title-asc":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return copy; // "featured" — preserve Shopify order
  }
}

// ── Module-level product cache (survives SPA navigations within the session) ──
// Keyed by collection handle. Avoids re-fetching when the user navigates back.
const _allProductsCache = new Map<string, ShopifyProduct[]>();

// ── Fetch ALL products in a collection (up to 250) for client-side filtering ──
function useAllCollectionProducts(handle: string, active: boolean) {
  const cached = handle ? _allProductsCache.get(handle) : undefined;
  const [products, setProducts] = useState<ShopifyProduct[]>(cached ?? []);
  const [loading, setLoading] = useState<boolean>(!cached && active && !!handle);

  useEffect(() => {
    if (!handle || !active) return;
    // Serve from cache immediately — no loading state needed
    const hit = _allProductsCache.get(handle);
    if (hit) {
      setProducts(hit);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`${STORE_URL}/collections/${handle}/products.json?limit=250`)
      .then((r) => r.json())
      .then((d) => {
        const prods: ShopifyProduct[] = d.products ?? [];
        _allProductsCache.set(handle, prods);
        setProducts(prods);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [handle, active]);

  return { products, loading };
}

// ── URL param helpers ──────────────────────────────────────────────────────────
function parseParams(search: string) {
  const p = new URLSearchParams(search);
  const rawSort = p.get("sort") ?? "featured";
  const sort: SortKey = SORT_OPTIONS.some((o) => o.value === rawSort)
    ? (rawSort as SortKey)
    : "featured";
  return {
    q: p.get("q") ?? "",
    minPrice: p.get("minPrice") ?? "",
    maxPrice: p.get("maxPrice") ?? "",
    sort,
    page: parseInt(p.get("page") ?? "1", 10) || 1,
  };
}

function buildSearch(params: {
  q: string;
  minPrice: string;
  maxPrice: string;
  sort: SortKey;
  page: number;
}) {
  const p = new URLSearchParams();
  if (params.q) p.set("q", params.q);
  if (params.minPrice) p.set("minPrice", params.minPrice);
  if (params.maxPrice) p.set("maxPrice", params.maxPrice);
  if (params.sort && params.sort !== "featured") p.set("sort", params.sort);
  if (params.page > 1) p.set("page", String(params.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default function Collection() {
  const params = useParams<{ handle: string }>();
  const handle = params.handle ?? "";
  const search = useSearch();
  const [, navigate] = useLocation();

  const { q, minPrice, maxPrice, sort, page } = parseParams(search);

  const [collectionMeta, setCollectionMeta] = useState<ShopifyCollection | null>(null);

  // Local controlled state for the filter inputs (to avoid renavigating on every keystroke)
  const [inputQ, setInputQ] = useState(q);
  const [inputMin, setInputMin] = useState(minPrice);
  const [inputMax, setInputMax] = useState(maxPrice);

  // Sync local inputs when URL changes (e.g. back/forward nav)
  useEffect(() => {
    setInputQ(q);
    setInputMin(minPrice);
    setInputMax(maxPrice);
  }, [q, minPrice, maxPrice]);

  const hasFilters = !!(q || minPrice || maxPrice);

  // Client-side mode: needed when filters are active OR sort is non-default
  // (Shopify's public REST endpoint ignores sort_by, so we must sort ourselves)
  const needsClientSide = hasFilters || sort !== "featured";

  // Paginated products — only used in featured/default mode with no filters
  const { products: pagedProducts, loading: pagedLoading, hasMore: pagedHasMore } =
    useCollectionProducts(handle, PAGE_SIZE, page);

  // All products — fetched when client-side processing is needed
  const { products: allProducts, loading: allLoading } =
    useAllCollectionProducts(handle, needsClientSide);

  // Fetch collection metadata
  useEffect(() => {
    if (!handle) return;
    fetch(`${STORE_URL}/collections.json?limit=250`)
      .then((r) => r.json())
      .then((d) => {
        const found = (d.collections as ShopifyCollection[]).find(
          (c) => c.handle === handle
        );
        setCollectionMeta(found ?? null);
      })
      .catch(() => {});
  }, [handle]);

  // Reset page (but keep filters) when the handle changes between collections.
  // Use a ref so we skip this on the very first mount and avoid stripping
  // query params from a directly opened / shared URL.
  const prevHandleRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevHandleRef.current !== null && prevHandleRef.current !== handle) {
      // Handle changed: preserve existing filters/sort but reset page to 1.
      const qs = buildSearch({ q, minPrice, maxPrice, sort, page: 1 });
      navigate(`/collections/${handle}${qs}`, { replace: true });
    }
    prevHandleRef.current = handle;
  // We intentionally read q/minPrice/maxPrice from the outer scope at
  // transition time; ESLint exhaustive-deps would warn but the effect
  // should only run when `handle` itself changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  // ── Apply filters + sort to the full product list ─────────────────────────
  // Used whenever needsClientSide (filter active OR non-featured sort).
  const processedProducts = useMemo(() => {
    if (!needsClientSide) return [];
    let list = allProducts;
    if (q) {
      const lower = q.toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(lower));
    }
    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);
    if (!isNaN(min)) {
      list = list.filter((p) => {
        const price = parseFloat(p.variants[0]?.price ?? "0");
        return price >= min;
      });
    }
    if (!isNaN(max) && max > 0) {
      list = list.filter((p) => {
        const price = parseFloat(p.variants[0]?.price ?? "0");
        return price <= max;
      });
    }
    return sortProducts(list, sort);
  }, [needsClientSide, allProducts, q, minPrice, maxPrice, sort]);

  // Client-side pagination over the processed list
  const clientPageProducts = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return processedProducts.slice(start, start + PAGE_SIZE);
  }, [processedProducts, page]);
  const clientHasMore = processedProducts.length > page * PAGE_SIZE;

  const displayedProducts = needsClientSide ? clientPageProducts : pagedProducts;
  const loading = needsClientSide ? allLoading : pagedLoading;
  const hasMore = needsClientSide ? clientHasMore : pagedHasMore;

  // ── Scroll save / restore ─────────────────────────────────────────────────
  // scrollKey encodes the exact URL (handle + full query string) so each
  // unique filter+page combo gets its own saved position.
  const scrollKey = `scroll:/collections/${handle}${search ? `?${search}` : ""}`;

  // 1. Save scroll Y on unmount (fires when the user navigates away to a product).
  useEffect(() => {
    const key = scrollKey; // capture at registration time
    return () => {
      const y = Math.round(window.scrollY);
      if (y > 0) sessionStorage.setItem(key, String(y));
      else sessionStorage.removeItem(key);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  // 2. Reset the restoration flag BEFORE the restore effect so that when
  //    scrollKey changes (filters, page, or back/forward), the restore effect
  //    always sees a cleared flag and runs a fresh restore.
  //    React guarantees effects fire in declaration order within a component.
  const didRestoreRef = useRef(false);
  useEffect(() => {
    didRestoreRef.current = false;
  }, [scrollKey]);

  // 3. Restore saved scroll, or scroll to top if there is no saved position.
  //    Scrolling to top here replaces the old page-change effect and also
  //    ensures fresh SPA navigations always start at the top.
  useEffect(() => {
    if (loading) return;
    if (didRestoreRef.current) return;
    didRestoreRef.current = true;

    const saved = sessionStorage.getItem(scrollKey);
    const y = saved ? parseInt(saved, 10) : NaN;
    if (!isNaN(y) && y > 0) {
      sessionStorage.removeItem(scrollKey); // consume once
      // rAF ensures the product grid has been painted before we scroll
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" }));
    } else {
      // Fresh navigation (no saved position) — always go to top
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [loading, scrollKey]);

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const applyFilters = useCallback(() => {
    const qs = buildSearch({ q: inputQ, minPrice: inputMin, maxPrice: inputMax, sort, page: 1 });
    navigate(`/collections/${handle}${qs}`);
  }, [handle, inputQ, inputMin, inputMax, sort, navigate]);

  const clearFilters = useCallback(() => {
    setInputQ("");
    setInputMin("");
    setInputMax("");
    navigate(`/collections/${handle}${sort !== "featured" ? `?sort=${sort}` : ""}`);
  }, [handle, sort, navigate]);

  const goToPage = useCallback(
    (p: number) => {
      const qs = buildSearch({ q: "", minPrice: "", maxPrice: "", sort, page: p });
      navigate(`/collections/${handle}${qs}`);
    },
    [handle, sort, navigate]
  );

  const changeSort = useCallback(
    (newSort: SortKey) => {
      const qs = buildSearch({ q, minPrice, maxPrice, sort: newSort, page: 1 });
      navigate(`/collections/${handle}${qs}`);
    },
    [handle, q, minPrice, maxPrice, navigate]
  );

  const title =
    collectionMeta?.title ??
    handle.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="min-h-screen bg-[#fafaf8] text-gray-900">
      <Navbar variant="light" />

      {/* ── Collection hero banner ─────────────────────────────────────────── */}
      <div
        className="pt-24 pb-16 relative overflow-hidden border-b border-gray-200"
        style={{ backgroundColor: "#111" }}
      >
        {collectionMeta?.image && (
          <>
            <img
              src={collectionMeta.image.src}
              alt={title}
              className="absolute inset-0 w-full h-full object-cover opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent" />
          </>
        )}

        <div className="relative z-10 max-w-7xl mx-auto px-6">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-gray-400 font-medium mb-6">
            <Link href="/" className="hover:text-yellow-400 transition-colors">
              Home
            </Link>
            <span>/</span>
            <Link href="/shop" className="hover:text-yellow-400 transition-colors">
              Shop
            </Link>
            <span>/</span>
            <span className="text-white capitalize">{title}</span>
          </nav>

          <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tight mb-3 capitalize">
            {title}
          </h1>
          {collectionMeta?.body_html && (
            <p className="text-gray-300 max-w-2xl text-sm leading-relaxed line-clamp-2">
              {collectionMeta.body_html
                .replace(/<[^>]*>/g, " ")
                .replace(/\s+/g, " ")
                .trim()}
            </p>
          )}

          <div className="flex items-center gap-4 mt-6">
            <Link
              href={`/chat?q=${encodeURIComponent(
                `I need help choosing from the ${title} category. Can you build me a quote?`
              )}`}
              className="inline-flex items-center gap-2 bg-yellow-400 text-black font-black text-xs uppercase tracking-widest px-4 py-2 hover:bg-yellow-300 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Get a Quote from AI
            </Link>
            <a
              href={`${STORE_URL}/collections/${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-white/30 text-white/70 hover:text-white hover:border-white font-bold text-xs uppercase tracking-widest px-4 py-2 transition-colors"
            >
              View on Shopify <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* ── Products grid ───────────────────────────────────────────────────── */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-6">

          {/* ── Search / Filter bar ─────────────────────────────────────────── */}
          <div className="mb-8 p-4 bg-white border border-gray-200 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
              {/* Keyword search */}
              <div className="flex-1 min-w-0">
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={inputQ}
                    onChange={(e) => setInputQ(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                    placeholder='e.g. "GPS", "thermal", "DJI"'
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 text-sm focus:outline-none focus:border-yellow-400 bg-gray-50"
                  />
                </div>
              </div>

              {/* Price range */}
              <div className="flex items-end gap-2">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">
                    Min $
                  </label>
                  <input
                    type="number"
                    value={inputMin}
                    onChange={(e) => setInputMin(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                    placeholder="0"
                    min="0"
                    className="w-24 px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-yellow-400 bg-gray-50"
                  />
                </div>
                <span className="pb-2 text-gray-400 text-sm font-medium">–</span>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">
                    Max $
                  </label>
                  <input
                    type="number"
                    value={inputMax}
                    onChange={(e) => setInputMax(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                    placeholder="Any"
                    min="0"
                    className="w-24 px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-yellow-400 bg-gray-50"
                  />
                </div>
              </div>

              {/* Sort */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">
                  Sort
                </label>
                <div className="relative">
                  <select
                    value={sort}
                    onChange={(e) => changeSort(e.target.value as SortKey)}
                    className="appearance-none pl-3 pr-8 py-2 border border-gray-300 text-sm font-medium focus:outline-none focus:border-yellow-400 bg-gray-50 cursor-pointer"
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={applyFilters}
                  className="inline-flex items-center gap-2 bg-gray-900 text-white font-black text-xs uppercase tracking-widest px-4 py-2 hover:bg-yellow-400 hover:text-black transition-colors"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Filter
                </button>
                {hasFilters && (
                  <button
                    onClick={clearFilters}
                    className="inline-flex items-center gap-2 border border-gray-300 text-gray-600 font-bold text-xs uppercase tracking-widest px-4 py-2 hover:border-red-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Active filter / sort pills */}
            {(hasFilters || sort !== "featured") && (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                {q && (
                  <span className="inline-flex items-center gap-1 bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs font-bold px-2 py-0.5">
                    Keyword: {q}
                  </span>
                )}
                {minPrice && (
                  <span className="inline-flex items-center gap-1 bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs font-bold px-2 py-0.5">
                    Min: ${minPrice}
                  </span>
                )}
                {maxPrice && (
                  <span className="inline-flex items-center gap-1 bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs font-bold px-2 py-0.5">
                    Max: ${maxPrice}
                  </span>
                )}
                {sort !== "featured" && (
                  <span className="inline-flex items-center gap-1 bg-gray-100 border border-gray-300 text-gray-700 text-xs font-bold px-2 py-0.5">
                    Sort: {SORT_OPTIONS.find((o) => o.value === sort)?.label}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Result count */}
          {!loading && displayedProducts.length > 0 && (
            <p className="text-gray-400 text-xs font-medium mb-6 uppercase tracking-widest">
              {needsClientSide
                ? `${processedProducts.length} result${processedProducts.length !== 1 ? "s" : ""}${processedProducts.length > PAGE_SIZE ? ` — page ${page}` : ""}`
                : `Page ${page} — ${pagedProducts.length} products`}
            </p>
          )}

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              <ProductSkeleton count={PAGE_SIZE} />
            </div>
          ) : displayedProducts.length === 0 ? (
            <div className="text-center py-24">
              {needsClientSide ? (
                <>
                  <p className="text-gray-400 text-lg mb-2">
                    No products match your filters.
                  </p>
                  <button
                    onClick={clearFilters}
                    className="text-yellow-500 font-bold hover:underline text-sm"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <p className="text-gray-400 text-lg mb-4">
                    No products found in this collection.
                  </p>
                  <Link
                    href="/shop"
                    className="text-yellow-500 font-bold hover:underline text-sm"
                  >
                    ← Back to all categories
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {displayedProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  collectionHandle={handle}
                  collectionTitle={title}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && (page > 1 || hasMore) && (
            <div className="flex items-center justify-center gap-4 mt-12">
              <button
                onClick={() => goToPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-bold text-gray-700 hover:border-yellow-400 hover:text-yellow-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <span className="text-gray-500 text-sm font-medium">Page {page}</span>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={!hasMore}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-bold text-gray-700 hover:border-yellow-400 hover:text-yellow-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── AI CTA ──────────────────────────────────────────────────────────── */}
      <section className="bg-gray-900 text-white py-14 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 bg-[repeating-linear-gradient(45deg,#fff_0px,#fff_1px,transparent_0px,transparent_50%)] bg-[length:20px_20px]" />
        <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-yellow-400 font-black text-xs uppercase tracking-widest">
                AI-Powered · Instant Quotes
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight leading-tight mb-2">
              Need expert advice on {title}?
            </h2>
            <p className="text-gray-400 max-w-lg text-sm leading-relaxed">
              Describe your mission — payload requirements, range, regulatory constraints —
              and get a pro-forma quote in seconds.
            </p>
          </div>
          <Link
            href={`/chat?q=${encodeURIComponent(
              `I need help choosing the right ${title}`
            )}`}
            className="shrink-0 inline-flex items-center gap-2 bg-yellow-400 text-black font-black text-sm uppercase tracking-widest px-8 py-4 hover:bg-yellow-300 transition-colors"
          >
            Ask AI Consultant <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
