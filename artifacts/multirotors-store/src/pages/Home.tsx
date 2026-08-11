import { ArrowRight, Shield, Zap, Truck, Award } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductCard, ProductSkeleton } from "@/components/shop/ProductCard";
import {
  useCollectionProducts,
  FEATURED_CATEGORIES,
  STORE_URL,
} from "@/lib/shopify";

// ─── TEMPORARY DIAGNOSTIC GRID ────────────────────────────────────────────────
// Shows the first 4 live Shopify products with raw titles, images, and URLs.
// Remove this component once image rendering is confirmed working.

interface DiagProduct {
  id: number;
  title: string;
  imageUrl: string | null;
}

interface DiagState {
  status: "loading" | "ok" | "error";
  products: DiagProduct[];
  rawUrl: string;
  errorMsg: string;
  httpStatus: number | null;
  rawBody: string;
}

function DiagnosticGrid() {
  const endpoint = `${STORE_URL}/products.json?limit=4`;
  const [state, setState] = useState<DiagState>({
    status: "loading",
    products: [],
    rawUrl: endpoint,
    errorMsg: "",
    httpStatus: null,
    rawBody: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(endpoint);
        const bodyText = await res.text();
        if (cancelled) return;
        if (!res.ok) {
          setState((s) => ({ ...s, status: "error", httpStatus: res.status, rawBody: bodyText.slice(0, 600), errorMsg: `HTTP ${res.status}` }));
          return;
        }
        let json: any;
        try { json = JSON.parse(bodyText); } catch (e) {
          setState((s) => ({ ...s, status: "error", errorMsg: "JSON parse failed", rawBody: bodyText.slice(0, 600) }));
          return;
        }
        const products: DiagProduct[] = (json.products ?? []).slice(0, 4).map((p: any) => ({
          id: p.id,
          title: p.title,
          imageUrl: p.images?.[0]?.src ?? null,
        }));
        setState((s) => ({ ...s, status: "ok", products, httpStatus: res.status, rawBody: bodyText.slice(0, 200) }));
      } catch (err: any) {
        if (!cancelled) setState((s) => ({ ...s, status: "error", errorMsg: String(err?.message ?? err) }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="bg-yellow-50 border-4 border-yellow-400 p-6 mx-auto max-w-7xl mt-24 rounded-xl shadow-lg z-50 relative">
      <div className="flex items-center gap-3 mb-4">
        <span className="bg-yellow-400 text-black font-black text-xs uppercase tracking-widest px-3 py-1 rounded">
          ⚠ Diagnostic — Remove Before Production
        </span>
        <span className="font-mono text-xs text-gray-600 break-all">
          Fetching: <a href={endpoint} target="_blank" rel="noreferrer" className="underline text-blue-600">{endpoint}</a>
        </span>
      </div>

      {state.status === "loading" && (
        <p className="font-mono text-sm text-gray-500 animate-pulse">Fetching from Shopify API…</p>
      )}

      {state.status === "error" && (
        <div className="bg-red-50 border border-red-300 rounded p-4 font-mono text-xs text-red-800 space-y-2">
          <p className="font-bold text-red-700">❌ Fetch Failed</p>
          <p><strong>Error:</strong> {state.errorMsg}</p>
          {state.httpStatus && <p><strong>HTTP Status:</strong> {state.httpStatus}</p>}
          {state.rawBody && (
            <pre className="bg-white border border-red-200 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all max-h-40">
              {state.rawBody}
            </pre>
          )}
        </div>
      )}

      {state.status === "ok" && (
        <>
          <p className="font-mono text-xs text-green-700 mb-4">
            ✅ HTTP {state.httpStatus} — {state.products.length} products returned
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {state.products.map((p) => (
              <div key={p.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                {/* Image */}
                <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                        const next = e.currentTarget.nextSibling as HTMLElement | null;
                        if (next) next.style.display = "block";
                      }}
                    />
                  ) : null}
                  <p className="hidden text-red-500 font-mono text-[10px] p-2 text-center">
                    ❌ Image failed to load
                  </p>
                  {!p.imageUrl && (
                    <p className="text-gray-400 font-mono text-[10px] p-2 text-center">No image URL returned</p>
                  )}
                </div>

                {/* Raw title */}
                <div className="p-2 border-t border-gray-100">
                  <p className="font-bold text-gray-900 text-xs leading-tight mb-1 line-clamp-2">{p.title}</p>
                  <p className="font-mono text-[9px] text-blue-600 break-all leading-tight">
                    {p.imageUrl ?? <span className="text-red-500">null — no image in API response</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  eyebrow,
  title,
  sub,
  href,
  internal,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  href?: string;
  internal?: boolean;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
      <div>
        {eyebrow && (
          <p className="text-yellow-500 font-black text-xs uppercase tracking-widest mb-2">
            {eyebrow}
          </p>
        )}
        <h2
          className="text-3xl md:text-4xl font-black text-gray-900 leading-tight tracking-tight"
          dangerouslySetInnerHTML={{ __html: title }}
        />
        {sub && <p className="text-gray-500 mt-2 max-w-2xl text-sm">{sub}</p>}
      </div>
      {href &&
        (internal ? (
          <Link
            href={href}
            className="inline-flex items-center gap-2 text-sm font-bold text-gray-900 hover:text-yellow-500 border-b-2 border-gray-900 hover:border-yellow-500 pb-0.5 transition-colors whitespace-nowrap self-end"
          >
            View All <ArrowRight className="w-4 h-4" />
          </Link>
        ) : (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-bold text-gray-900 hover:text-yellow-500 border-b-2 border-gray-900 hover:border-yellow-500 pb-0.5 transition-colors whitespace-nowrap self-end"
          >
            View All <ArrowRight className="w-4 h-4" />
          </a>
        ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Home() {
  const featured = useCollectionProducts("enterprise-drones", 6);
  const fpv = useCollectionProducts("fpv-drones", 4);
  const robotics = useCollectionProducts("educational-robots", 4);
  const lidar = useCollectionProducts("lidar", 4);

  return (
    <div className="min-h-screen bg-[#fafaf8] text-gray-900">
      <DiagnosticGrid />
      <Navbar variant="light" />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden pt-16">
        <div className="absolute inset-0 z-0">
          <img
            src="https://cdn.shopify.com/s/files/1/0732/4863/7218/files/d3716d_44a3e1debca44de2812700c7014cdc91_mv2.webp"
            alt="Go2 Robot"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 w-full py-24">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 bg-yellow-400 text-black text-[10px] font-black uppercase tracking-widest px-3 py-1.5 mb-6">
              Blue UAS Compliant Systems
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-white leading-[1.02] tracking-tight mb-6 uppercase">
              Autonomous<br />
              Drone &amp;<br />
              <span className="text-yellow-400">Robots</span>
            </h1>
            <p className="text-white/80 text-lg mb-10 leading-relaxed max-w-md">
              Reseller &amp; Integrator of enterprise UAVs, quadruped robots, AMR platforms,
              LiDAR sensors, and payloads for defense, research, and industry.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 bg-yellow-400 text-black font-black text-sm uppercase tracking-widest px-6 py-3 hover:bg-yellow-300 transition-colors"
              >
                Shop All Products <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 border-2 border-white text-white font-black text-sm uppercase tracking-widest px-6 py-3 hover:bg-white hover:text-black transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                AI Consultant
              </Link>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-white/40 text-[10px] uppercase tracking-widest">
          <span>Scroll</span>
          <div className="w-px h-8 bg-white/20 animate-pulse" />
        </div>
      </section>

      {/* ── TRUST BAR ──────────────────────────────────────────────────────── */}
      <section className="bg-white border-y border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { icon: Shield, label: "NDAA Compliant", sub: "Blue UAS certified systems" },
              { icon: Award, label: "Expert Integration", sub: "Custom payload engineering" },
              { icon: Truck, label: "Global Shipping", sub: "Secure worldwide delivery" },
              { icon: Zap, label: "Enterprise Grade", sub: "Mission-critical reliability" },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 bg-yellow-400 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-black" />
                </div>
                <p className="font-black text-xs uppercase tracking-widest text-gray-900">{label}</p>
                <p className="text-gray-400 text-xs">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURED PRODUCTS (enterprise-drones) ──────────────────────────── */}
      <section className="py-20 bg-[#fafaf8]">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeader
            eyebrow="Blue UAS · NDAA Compliant"
            title="Enterprise Drones"
            sub="Development platforms, research UAVs, and autonomous systems for professional operations."
            href="/collections/enterprise-drones"
            internal
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {featured.loading ? (
              <ProductSkeleton count={6} />
            ) : (
              featured.products.map((p) => <ProductCard key={p.id} product={p} />)
            )}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/collections/enterprise-drones"
              className="inline-flex items-center gap-2 border-2 border-gray-900 text-gray-900 font-black text-sm uppercase tracking-widest px-6 py-3 hover:bg-gray-900 hover:text-white transition-colors"
            >
              View All Enterprise Drones <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── CATEGORIES GRID ──────────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50 border-y border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeader
            eyebrow="Browse by category"
            title="Platforms &amp; Systems"
            sub="Industrial-grade robotics and autonomous platforms for the most demanding environments."
            href="/shop"
            internal
          />
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
                  className="w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-105 transition-all duration-500"
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

      {/* ── FPV DRONES ───────────────────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeader
            eyebrow="Racing &amp; Cinema"
            title="FPV Drones"
            sub="High-performance FPV quads and cinematic systems for professional aerial work."
            href="/collections/fpv-drones"
            internal
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {fpv.loading ? (
              <ProductSkeleton count={4} />
            ) : (
              fpv.products.map((p) => <ProductCard key={p.id} product={p} size="compact" />)
            )}
          </div>
        </div>
      </section>

      {/* ── AI CONSULTANT PROMO ──────────────────────────────────────────────── */}
      <section className="bg-gray-900 text-white py-14 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 bg-[repeating-linear-gradient(45deg,#fff_0px,#fff_1px,transparent_0px,transparent_50%)] bg-[length:20px_20px]" />
        <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-yellow-400 font-black text-xs uppercase tracking-widest">
                New · AI-Powered
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight leading-tight mb-3">
              Meet Your AI Drone Consultant
            </h2>
            <p className="text-gray-400 max-w-xl text-sm leading-relaxed">
              Describe your mission and get a pro-forma invoice in seconds. Our AI searches
              the live catalog, adds external accessories, and compiles a ready-to-sign quote.
            </p>
          </div>
          <Link
            href="/chat"
            className="shrink-0 inline-flex items-center gap-2 bg-yellow-400 text-black font-black text-sm uppercase tracking-widest px-8 py-4 hover:bg-yellow-300 transition-colors"
          >
            Try AI Consultant <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── ROBOTICS ─────────────────────────────────────────────────────────── */}
      <section className="py-20 bg-[#fafaf8]">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeader
            eyebrow="Quadrupeds &amp; Mobile Robots"
            title="Robotics"
            sub="Legged robots, AMR platforms, and educational systems for research and industrial automation."
            href="/collections/robotic"
            internal
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {robotics.loading ? (
              <ProductSkeleton count={4} />
            ) : (
              robotics.products.map((p) => <ProductCard key={p.id} product={p} />)
            )}
          </div>
        </div>
      </section>

      {/* ── LIDAR & SENSORS ──────────────────────────────────────────────────── */}
      <section className="py-20 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeader
            eyebrow="Perception &amp; Ranging"
            title="LiDAR &amp; Sensors"
            sub="High-precision distance sensing, 3D mapping, and payload systems for autonomous navigation."
            href="/collections/lidar"
            internal
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {lidar.loading ? (
              <ProductSkeleton count={4} />
            ) : (
              lidar.products.map((p) => <ProductCard key={p.id} product={p} size="compact" />)
            )}
          </div>
        </div>
      </section>

      {/* ── GOVERNMENT & EDUCATION CTA ────────────────────────────────────────── */}
      <section className="bg-yellow-400 py-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,#000_0px,#000_1px,transparent_0,transparent_50%)] bg-[length:20px_20px] opacity-[0.04]" />
        <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-black" />
              <span className="font-black text-xs uppercase tracking-widest text-black">
                GSA · NDAA · NET30
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-black uppercase tracking-tight leading-tight mb-3">
              Government &amp; Education Procurement
            </h2>
            <p className="text-black/70 max-w-xl text-sm leading-relaxed">
              Streamlined purchasing for US government agencies, defense contractors, and
              research universities. GSA scheduling, NET30 terms, and educational discounts
              available.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <a
              href={`${STORE_URL}/pages/contact`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-black text-white font-black text-sm uppercase tracking-widest px-6 py-3 hover:bg-gray-900 transition-colors"
            >
              Request Agency Quote
            </a>
            <Link
              href="/chat"
              className="inline-flex items-center justify-center gap-2 border-2 border-black text-black font-black text-sm uppercase tracking-widest px-6 py-3 hover:bg-black hover:text-white transition-colors"
            >
              Ask AI Consultant
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
