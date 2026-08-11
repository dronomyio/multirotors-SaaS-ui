import { useState, useEffect } from "react";
import { Link, useParams, useSearch } from "wouter";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Package,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import {
  STORE_URL,
  type ShopifyProduct,
  formatPrice,
  stripHtml,
  useCollectionProducts,
  useProductCollection,
} from "@/lib/shopify";
import { ProductCard, ProductSkeleton } from "@/components/shop/ProductCard";

// ── Fetch a single product by handle ─────────────────────────────────────────
function useProduct(handle: string) {
  const [product, setProduct] = useState<ShopifyProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!handle) return;
    setLoading(true);
    setError(false);
    fetch(`${STORE_URL}/products/${handle}.json`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((d) => setProduct(d.product ?? null))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [handle]);

  return { product, loading, error };
}

// ── Image gallery ─────────────────────────────────────────────────────────────
function ImageGallery({ images, title }: { images: Array<{ src: string }>; title: string }) {
  const [selected, setSelected] = useState(0);

  if (!images.length) {
    return (
      <div className="aspect-square bg-gray-100 flex items-center justify-center">
        <Package className="w-16 h-16 text-gray-300" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Main image */}
      <div className="aspect-square bg-gray-50 border border-gray-200 overflow-hidden flex items-center justify-center p-8">
        <img
          src={images[selected].src}
          alt={`${title} — image ${selected + 1}`}
          className="w-full h-full object-contain"
        />
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={`shrink-0 w-16 h-16 border-2 overflow-hidden transition-colors ${
                i === selected
                  ? "border-yellow-400"
                  : "border-gray-200 hover:border-gray-400"
              }`}
            >
              <img
                src={img.src}
                alt={`${title} thumbnail ${i + 1}`}
                className="w-full h-full object-contain p-1"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Related products ──────────────────────────────────────────────────────────
function RelatedProducts({
  collectionHandle,
  collectionTitle,
  currentHandle,
}: {
  collectionHandle: string;
  collectionTitle?: string;
  currentHandle: string;
}) {
  // Fetch up to 12 products so we can exclude the current one and still have 4–6
  const { products, loading } = useCollectionProducts(collectionHandle, 12, 1);

  const related = products.filter((p) => p.handle !== currentHandle).slice(0, 6);

  // Don't render if there's nothing to show (and not still loading)
  if (!loading && related.length === 0) return null;

  const sectionTitle = collectionTitle
    ? `More from ${collectionTitle}`
    : "You Might Also Like";

  return (
    <section className="max-w-7xl mx-auto px-6 py-12 border-t border-gray-200">
      <h2 className="text-xl font-black uppercase tracking-tight text-gray-900 mb-6">
        {sectionTitle}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {loading ? (
          <ProductSkeleton count={6} />
        ) : (
          related.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              size="compact"
              collectionHandle={collectionHandle}
              collectionTitle={collectionTitle}
            />
          ))
        )}
      </div>
    </section>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function ProductDetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12 animate-pulse">
      <div className="grid md:grid-cols-2 gap-12">
        <div className="aspect-square bg-gray-100" />
        <div className="space-y-4">
          <div className="h-8 bg-gray-100 rounded w-3/4" />
          <div className="h-5 bg-gray-100 rounded w-1/4" />
          <div className="space-y-2 mt-6">
            <div className="h-4 bg-gray-100 rounded" />
            <div className="h-4 bg-gray-100 rounded w-5/6" />
            <div className="h-4 bg-gray-100 rounded w-4/6" />
          </div>
          <div className="h-12 bg-gray-100 rounded mt-8" />
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProductDetail() {
  const params = useParams<{ handle: string }>();
  const handle = params.handle ?? "";
  const search = useSearch();
  const searchParams = new URLSearchParams(search);

  // Optional collection context passed from Collection page
  const fromCollection = searchParams.get("from") ?? "";
  const fromCollectionTitle = searchParams.get("fromTitle") ?? "";
  // Restore the exact collection URL (including filters/sort/page) so the
  // back-link returns the customer to the same filtered state they came from.
  const fromSearch = searchParams.get("fromSearch") ?? "";

  const { product, loading, error } = useProduct(handle);

  // When the page is opened via a direct link (no `from` param), look up the
  // product's collection membership so the breadcrumb stays meaningful.
  // Pass the handle (not product ID) — the API server uses the Storefront
  // GraphQL API which looks up collections by product handle.
  const { collection: discoveredCollection } = useProductCollection(
    fromCollection ? null : (handle || null)
  );

  const effectiveCollection = fromCollection || discoveredCollection?.handle || "";
  const effectiveCollectionTitle =
    fromCollectionTitle || discoveredCollection?.title || "";

  // Back-link destination: restore the exact filtered state when coming from a
  // collection page; otherwise link to the discovered collection or the shop.
  const collectionBackHref = fromCollection
    ? `/collections/${fromCollection}${fromSearch}`
    : effectiveCollection
      ? `/collections/${effectiveCollection}`
      : "/shop";
  const collectionLabel =
    effectiveCollectionTitle ||
    effectiveCollection.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const price = product?.variants[0]?.price ?? "0";
  const shopifyUrl = `${STORE_URL}/products/${handle}`;
  const chatHref = `/chat?q=${encodeURIComponent(
    `Tell me about the ${product?.title ?? handle} and build a quote`
  )}`;

  return (
    <div className="min-h-screen bg-[#fafaf8] text-gray-900">
      <Navbar variant="light" />

      <div className="pt-20">
        {/* ── Breadcrumb bar ───────────────────────────────────────────────── */}
        <div className="border-b border-gray-200 bg-white">
          <div className="max-w-7xl mx-auto px-6 py-3">
            <nav className="flex items-center gap-2 text-xs text-gray-400 font-medium flex-wrap">
              <Link href="/" className="hover:text-yellow-600 transition-colors">
                Home
              </Link>
              <ChevronRight className="w-3 h-3" />
              <Link href="/shop" className="hover:text-yellow-600 transition-colors">
                Shop
              </Link>
              {effectiveCollection && (
                <>
                  <ChevronRight className="w-3 h-3" />
                  <Link
                    href={collectionBackHref}
                    className="hover:text-yellow-600 transition-colors capitalize"
                  >
                    {collectionLabel}
                  </Link>
                </>
              )}
              <ChevronRight className="w-3 h-3" />
              <span className="text-gray-700 font-semibold line-clamp-1 max-w-xs">
                {product?.title ?? handle}
              </span>
            </nav>
          </div>
        </div>

        {/* ── Content ──────────────────────────────────────────────────────── */}
        {loading ? (
          <ProductDetailSkeleton />
        ) : error || !product ? (
          <div className="max-w-7xl mx-auto px-6 py-24 text-center">
            <p className="text-gray-400 text-lg mb-4">Product not found.</p>
            <Link href="/shop" className="text-yellow-500 font-bold hover:underline text-sm">
              ← Back to Shop
            </Link>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="grid md:grid-cols-2 gap-12 items-start">
              {/* Left: image gallery */}
              <ImageGallery images={product.images} title={product.title} />

              {/* Right: details */}
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-gray-900 leading-tight mb-3">
                  {product.title}
                </h1>

                {/* Price */}
                <p className="text-3xl font-black text-gray-900 mb-6">
                  {formatPrice(price)}
                </p>

                {/* Variants */}
                {product.variants.length > 1 && (
                  <div className="mb-6">
                    <p className="text-xs font-black uppercase tracking-widest text-gray-500 mb-2">
                      Options
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {product.variants.map((v) => (
                        <span
                          key={v.id}
                          className="px-3 py-1.5 border border-gray-200 text-xs font-semibold text-gray-700 bg-white"
                        >
                          {v.title}
                          {v.price !== price && (
                            <span className="ml-1 text-gray-400">
                              {formatPrice(v.price)}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* CTA buttons */}
                <div className="flex flex-col sm:flex-row gap-3 mb-8">
                  <a
                    href={shopifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-gray-900 text-white font-black text-sm uppercase tracking-widest px-6 py-4 hover:bg-yellow-400 hover:text-black transition-colors"
                  >
                    Buy on Shopify <ExternalLink className="w-4 h-4" />
                  </a>
                  <Link
                    href={chatHref}
                    className="flex-1 inline-flex items-center justify-center gap-2 border-2 border-gray-900 text-gray-900 font-black text-sm uppercase tracking-widest px-6 py-4 hover:bg-gray-900 hover:text-white transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" /> Ask AI about this
                  </Link>
                </div>

                {/* Tags */}
                {product.tags && (
                  <div className="flex flex-wrap gap-1.5 mb-6">
                    {product.tags
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .slice(0, 8)
                      .map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wide"
                        >
                          {tag}
                        </span>
                      ))}
                  </div>
                )}

                {/* Description */}
                {product.body_html && (
                  <div className="border-t border-gray-200 pt-6">
                    <p className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4">
                      Description
                    </p>
                    <div
                      className="prose prose-sm max-w-none text-gray-600 leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-1 [&_p]:mb-3 [&_strong]:text-gray-800 [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-bold"
                      dangerouslySetInnerHTML={{ __html: product.body_html }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Back link */}
            <div className="mt-12 pt-8 border-t border-gray-200">
              <Link
                href={collectionBackHref}
                className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 text-sm font-bold transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                {effectiveCollection ? `Back to ${collectionLabel}` : "Back to Shop"}
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ── Related products ──────────────────────────────────────────────────── */}
      {product && fromCollection && (
        <RelatedProducts
          collectionHandle={fromCollection}
          collectionTitle={fromCollectionTitle || undefined}
          currentHandle={handle}
        />
      )}

      {/* ── AI CTA strip ─────────────────────────────────────────────────────── */}
      {product && (
        <section className="bg-gray-900 text-white py-10 relative overflow-hidden">
          <div className="absolute inset-0 opacity-5 bg-[repeating-linear-gradient(45deg,#fff_0px,#fff_1px,transparent_0px,transparent_50%)] bg-[length:20px_20px]" />
          <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-yellow-400 font-black text-xs uppercase tracking-widest">
                  AI-Powered · Instant Quotes
                </span>
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight leading-tight">
                Have questions about the {product.title}?
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                Our AI drone consultant can spec this product for your mission.
              </p>
            </div>
            <Link
              href={chatHref}
              className="shrink-0 inline-flex items-center gap-2 bg-yellow-400 text-black font-black text-sm uppercase tracking-widest px-8 py-4 hover:bg-yellow-300 transition-colors"
            >
              Ask AI Consultant <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}
