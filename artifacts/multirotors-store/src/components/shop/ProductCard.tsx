import { Link } from "wouter";
import { MessageSquare, ShoppingCart } from "lucide-react";
import { type ShopifyProduct, formatPrice, stripHtml, STORE_URL } from "@/lib/shopify";

interface ProductCardProps {
  product: ShopifyProduct;
  size?: "normal" | "compact";
  /** When coming from a collection page, pass the handle so the detail page can show a breadcrumb. */
  collectionHandle?: string;
  collectionTitle?: string;
}

function productDetailHref(
  handle: string,
  collectionHandle?: string,
  collectionTitle?: string
): string {
  const params = new URLSearchParams();
  if (collectionHandle) params.set("from", collectionHandle);
  if (collectionTitle) params.set("fromTitle", collectionTitle);
  // Carry the collection's current filter/sort/page query string so the
  // product detail page can reconstruct the exact back-link URL.
  const collectionSearch = window.location.search;
  if (collectionHandle && collectionSearch) {
    params.set("fromSearch", collectionSearch);
  }
  const qs = params.toString();
  return `/products/${handle}${qs ? `?${qs}` : ""}`;
}

export function ProductCard({
  product,
  size = "normal",
  collectionHandle,
  collectionTitle,
}: ProductCardProps) {
  const price = product.variants[0]?.price ?? "0";
  const img = product.images[0]?.src;
  const desc = stripHtml(product.body_html).slice(0, 90);
  const inStock = parseFloat(price) > 0;

  const detailHref = productDetailHref(product.handle, collectionHandle, collectionTitle);

  // Encode a pre-filled chat message about this product
  const chatHref = `/chat?q=${encodeURIComponent(
    `Tell me about the ${product.title} and build a quote`
  )}`;

  if (size === "compact") {
    return (
      <div className="group bg-white border border-gray-200 hover:border-yellow-400 hover:shadow-md transition-all flex flex-col">
        <Link href={detailHref} className="block">
          <div className="aspect-square overflow-hidden bg-gray-50 flex items-center justify-center p-4">
            {img ? (
              <img
                src={img}
                alt={product.title}
                className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full bg-gray-100" />
            )}
          </div>
          <div className="p-3">
            <h3 className="font-semibold text-gray-900 text-xs line-clamp-2 leading-snug mb-1">
              {product.title}
            </h3>
            <p className="font-black text-gray-900 text-sm">{formatPrice(price)}</p>
          </div>
        </Link>
        <div className="px-3 pb-3 mt-auto">
          <Link
            href={chatHref}
            className="w-full flex items-center justify-center gap-1.5 border border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 text-gray-600 hover:text-gray-900 text-[10px] font-bold uppercase tracking-wide py-1.5 transition-colors"
          >
            <MessageSquare className="w-3 h-3" /> Ask AI
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="group bg-white border border-gray-200 hover:border-yellow-400 hover:shadow-lg transition-all flex flex-col">
      <Link href={detailHref} className="block">
        <div className="relative aspect-square overflow-hidden bg-gray-50 flex items-center justify-center p-6">
          {inStock && (
            <span className="absolute top-3 left-3 bg-yellow-400 text-black text-[9px] font-black px-2 py-0.5 uppercase tracking-widest">
              In Stock
            </span>
          )}
          {img ? (
            <img
              src={img}
              alt={product.title}
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full bg-gray-100" />
          )}
        </div>
        <div className="p-5 border-t border-gray-100">
          <h3 className="font-bold text-gray-900 text-sm line-clamp-2 mb-1 leading-snug">
            {product.title}
          </h3>
          {desc && (
            <p className="text-gray-400 text-xs mb-4 line-clamp-2 leading-relaxed">{desc}</p>
          )}
          <div className="flex items-center justify-between">
            <span className="font-black text-lg text-gray-900">{formatPrice(price)}</span>
            <span className="p-2 bg-gray-900 text-white group-hover:bg-yellow-400 group-hover:text-black transition-colors">
              <ShoppingCart className="w-4 h-4" />
            </span>
          </div>
        </div>
      </Link>
      <div className="px-5 pb-5">
        <Link
          href={chatHref}
          className="w-full flex items-center justify-center gap-2 border border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 text-gray-500 hover:text-gray-900 text-xs font-bold uppercase tracking-wide py-2 transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" /> Ask AI Consultant
        </Link>
      </div>
    </div>
  );
}

export function ProductSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 animate-pulse">
          <div className="aspect-square bg-gray-100" />
          <div className="p-5 space-y-3">
            <div className="h-4 bg-gray-100 rounded w-3/4" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
            <div className="h-6 bg-gray-100 rounded w-1/3 mt-4" />
          </div>
        </div>
      ))}
    </>
  );
}
