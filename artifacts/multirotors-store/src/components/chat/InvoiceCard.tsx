import {
  Package,
  ExternalLink,
  ShoppingCart,
  Loader2,
  Truck,
  AlertCircle,
  Store,
  Globe,
  CheckCircle2,
} from "lucide-react";
import { Invoice, InvoiceItem } from "@/types/chat";

interface InvoiceCardProps {
  invoice: Invoice;
  onAccept: () => void;
  isAccepting: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// ─── Item row ─────────────────────────────────────────────────────────────────

function ItemRow({ item }: { item: InvoiceItem }) {
  const lineTotal = item.price * item.quantity;
  const isStore = item.source === "store";

  return (
    <tr className="border-b border-gray-800/60 hover:bg-white/[0.02] transition-colors group">
      {/* Thumbnail + name */}
      <td className="py-3 pl-4 pr-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded shrink-0 bg-gray-900 border border-gray-700 flex items-center justify-center overflow-hidden">
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <Package className="w-4 h-4 text-gray-500" />
            )}
          </div>
          <div className="min-w-0">
            {item.productUrl ? (
              <a
                href={item.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-white text-sm hover:text-yellow-400 transition-colors leading-tight flex items-center gap-1 group-hover:underline underline-offset-2"
                title={item.title}
              >
                <span className="truncate max-w-[220px] block">{item.title}</span>
                <ExternalLink className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
              </a>
            ) : (
              <span className="font-medium text-white text-sm leading-tight truncate max-w-[240px] block" title={item.title}>
                {item.title}
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Unit price */}
      <td className="py-3 px-3 text-right tabular-nums text-gray-400 text-sm whitespace-nowrap">
        {usd(item.price)}
      </td>

      {/* Qty */}
      <td className="py-3 px-3 text-center tabular-nums text-gray-300 text-sm">
        {item.quantity}
      </td>

      {/* Line total */}
      <td className={`py-3 pl-3 pr-4 text-right tabular-nums text-sm font-semibold whitespace-nowrap ${isStore ? "text-yellow-400" : "text-blue-400"}`}>
        {usd(lineTotal)}
      </td>
    </tr>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHead({
  icon: Icon,
  label,
  color,
  count,
}: {
  icon: React.ElementType;
  label: string;
  color: "yellow" | "blue";
  count: number;
}) {
  const cls = color === "yellow"
    ? "bg-yellow-400/10 text-yellow-400 border-yellow-400/20"
    : "bg-blue-500/10 text-blue-400 border-blue-500/20";

  return (
    <tr>
      <td colSpan={4} className="pt-4 pb-1 px-4">
        <div className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded border ${cls}`}>
          <Icon className="w-3 h-3" />
          {label}
          <span className="opacity-60">({count})</span>
        </div>
      </td>
    </tr>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

export function InvoiceCard({ invoice, onAccept, isAccepting }: InvoiceCardProps) {
  const storeItems = invoice.items.filter((i) => i.source === "store");
  const externalItems = invoice.items.filter((i) => i.source === "external");

  const storeSubtotal = storeItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const externalSubtotal = externalItems.reduce((s, i) => s + i.price * i.quantity, 0);

  const shippingIsFree = invoice.shipping === 0;
  const deliveryMin = invoice.estimatedDeliveryDays;
  const deliveryMax = deliveryMin + (externalItems.length > 0 ? 5 : 2);

  return (
    <div className="my-5 rounded-lg overflow-hidden border border-gray-700/60 bg-gray-950 shadow-2xl shadow-black/40 text-sm">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <span className="font-black text-yellow-400 text-xs uppercase tracking-widest">
            Pro-Forma Invoice
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-400 text-xs">
          <Truck className="w-3.5 h-3.5" />
          Est. delivery {deliveryMin}–{deliveryMax} business days
        </div>
      </div>

      {/* ── Source legend ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-2.5 bg-gray-900/40 border-b border-gray-800/60 text-[11px]">
        {storeItems.length > 0 && (
          <div className="flex items-center gap-1.5 text-yellow-400/80">
            <Store className="w-3 h-3" />
            <span className="font-semibold">{storeItems.length} item{storeItems.length > 1 ? "s" : ""}</span>
            <span className="text-gray-500">from multirotors.store</span>
          </div>
        )}
        {externalItems.length > 0 && (
          <div className="flex items-center gap-1.5 text-blue-400/80">
            <Globe className="w-3 h-3" />
            <span className="font-semibold">{externalItems.length} item{externalItems.length > 1 ? "s" : ""}</span>
            <span className="text-gray-500">sourced via web search</span>
          </div>
        )}
      </div>

      {/* ── Items table ─────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-800 text-[10px] text-gray-500 uppercase tracking-wider">
              <th className="py-2 pl-4 pr-3 text-left font-normal">Item</th>
              <th className="py-2 px-3 text-right font-normal">Unit Price</th>
              <th className="py-2 px-3 text-center font-normal">Qty</th>
              <th className="py-2 pl-3 pr-4 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {/* ── Store items section ── */}
            {storeItems.length > 0 && (
              <>
                <SectionHead icon={Store} label="In Stock — multirotors.store" color="yellow" count={storeItems.length} />
                {storeItems.map((item, idx) => <ItemRow key={`store-${idx}`} item={item} />)}
                {storeItems.length > 0 && externalItems.length > 0 && (
                  <tr>
                    <td colSpan={3} className="pt-2 pb-1 pl-4 text-[10px] text-gray-600 text-right pr-3">
                      Store subtotal
                    </td>
                    <td className="pt-2 pb-1 pr-4 text-right text-[10px] text-yellow-500/70 tabular-nums">
                      {usd(storeSubtotal)}
                    </td>
                  </tr>
                )}
              </>
            )}

            {/* ── External items section ── */}
            {externalItems.length > 0 && (
              <>
                <SectionHead icon={Globe} label="External — Sourced via Tavily Web Search" color="blue" count={externalItems.length} />
                {externalItems.map((item, idx) => <ItemRow key={`ext-${idx}`} item={item} />)}
                {storeItems.length > 0 && (
                  <tr>
                    <td colSpan={3} className="pt-2 pb-1 pl-4 text-[10px] text-gray-600 text-right pr-3">
                      External subtotal
                    </td>
                    <td className="pt-2 pb-1 pr-4 text-right text-[10px] text-blue-400/70 tabular-nums">
                      {usd(externalSubtotal)}
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Cost breakdown ──────────────────────────────────────────────────── */}
      <div className="border-t border-gray-800 px-4 py-4 bg-gray-900/50">
        <div className="ml-auto max-w-xs space-y-2 text-sm tabular-nums">
          <div className="flex justify-between text-gray-400">
            <span>Subtotal</span>
            <span>{usd(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Tax <span className="text-gray-600 text-xs">(8.5%)</span></span>
            <span>{usd(invoice.tax)}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span className="flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" />
              Shipping
              <span className="text-gray-600 text-xs">
                ({deliveryMin}–{deliveryMax} days)
              </span>
            </span>
            <span className={shippingIsFree ? "text-green-400 font-semibold" : ""}>
              {shippingIsFree ? "FREE" : usd(invoice.shipping)}
            </span>
          </div>
          <div className="border-t border-gray-700 pt-2 flex justify-between font-black text-base">
            <span className="text-white">TOTAL ({invoice.currency})</span>
            <span className="text-yellow-400">{usd(invoice.total)}</span>
          </div>
        </div>
      </div>

      {/* ── External items notice ───────────────────────────────────────────── */}
      {externalItems.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex items-start gap-2 text-[11px] text-blue-400/70 bg-blue-500/5 border border-blue-500/15 rounded px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {externalItems.length} item{externalItems.length > 1 ? "s" : ""} sourced externally via Tavily web search will
              be excluded from the Shopify checkout — prices are market estimates only.
              Store items will proceed directly to checkout.
            </span>
          </div>
        </div>
      )}

      {/* ── Checkout button ─────────────────────────────────────────────────── */}
      <div className="px-4 pb-4">
        <button
          onClick={onAccept}
          disabled={isAccepting || storeItems.length === 0}
          className="w-full flex items-center justify-center gap-2.5 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-black font-black text-sm uppercase tracking-widest h-12 transition-colors rounded-sm"
        >
          {isAccepting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Building Checkout…
            </>
          ) : storeItems.length === 0 ? (
            <>
              <AlertCircle className="w-4 h-4" />
              No Store Items to Checkout
            </>
          ) : (
            <>
              <ShoppingCart className="w-4 h-4" />
              Accept &amp; Checkout
              {storeItems.length > 0 && (
                <span className="font-medium opacity-70 normal-case tracking-normal">
                  ({storeItems.length} store item{storeItems.length > 1 ? "s" : ""} · {usd(storeSubtotal + invoice.tax + invoice.shipping)})
                </span>
              )}
            </>
          )}
        </button>

        {storeItems.length > 0 && (
          <p className="flex items-center justify-center gap-1.5 mt-2 text-[11px] text-gray-500">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            Redirects to multirotors.store secure checkout
          </p>
        )}
      </div>
    </div>
  );
}
