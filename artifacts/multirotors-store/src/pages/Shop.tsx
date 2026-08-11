import { Link } from "wouter";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useShopifyCollections, FEATURED_CATEGORIES } from "@/lib/shopify";

export default function Shop() {
  const { collections, loading } = useShopifyCollections();

  return (
    <div className="min-h-screen bg-[#fafaf8] text-gray-900">
      <Navbar variant="light" />

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="pt-24 pb-12 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-gray-400 font-medium mb-6">
            <Link href="/" className="hover:text-yellow-500 transition-colors">Home</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-900 font-bold">Shop</span>
          </nav>
          <p className="text-yellow-500 font-black text-xs uppercase tracking-widest mb-2">
            Full Catalog
          </p>
          <h1 className="text-4xl md:text-5xl font-black text-gray-900 uppercase tracking-tight mb-3">
            All Categories
          </h1>
          <p className="text-gray-500 max-w-2xl text-sm leading-relaxed">
            Enterprise UAVs, quadruped robots, LiDAR sensors, FPV systems, electronics and more — browse the full multirotors.store catalog.
          </p>
        </div>
      </div>

      {/* ── Featured categories ───────────────────────────────────────────── */}
      <section className="py-12 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-yellow-500 font-black text-xs uppercase tracking-widest mb-6">Featured</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {FEATURED_CATEGORIES.map(({ handle, title, sub, img }) => (
              <Link
                key={handle}
                href={`/collections/${handle}`}
                className="group relative aspect-square overflow-hidden bg-gray-900 block"
              >
                <img
                  src={img}
                  alt={title}
                  className="w-full h-full object-cover opacity-70 group-hover:opacity-95 group-hover:scale-105 transition-all duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <div className="absolute bottom-0 left-0 p-3 w-full">
                  <h3 className="text-white font-black text-xs uppercase tracking-wide leading-tight">
                    {title}
                  </h3>
                  <p className="text-white/60 text-[10px] mt-0.5 line-clamp-1">{sub}</p>
                </div>
                <div className="absolute top-2 right-2 w-6 h-6 bg-yellow-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="w-3 h-3 text-black" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── All collections ───────────────────────────────────────────────── */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-yellow-500 font-black text-xs uppercase tracking-widest mb-6">All Departments</p>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[4/3] bg-gray-200 mb-3" />
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-1" />
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {collections.map((col) => (
                <Link
                  key={col.handle}
                  href={`/collections/${col.handle}`}
                  className="group block"
                >
                  <div className="aspect-[4/3] overflow-hidden bg-gray-100 mb-3 relative">
                    {col.image && (
                      <img
                        src={col.image.src}
                        alt={col.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    <div className="absolute bottom-2 right-2 w-7 h-7 bg-yellow-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="w-3.5 h-3.5 text-black" />
                    </div>
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm group-hover:text-yellow-600 transition-colors leading-tight">
                    {col.title}
                  </h3>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── AI Consultant CTA ─────────────────────────────────────────────── */}
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
              Not sure where to start?
            </h2>
            <p className="text-gray-400 max-w-lg text-sm leading-relaxed">
              Describe your mission and our AI consultant will recommend the right platform and generate a ready-to-sign quote.
            </p>
          </div>
          <Link
            href="/chat"
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
