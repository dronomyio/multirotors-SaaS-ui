/**
 * THE COMPONENT REGISTRY — the seam between this repo and Replit's design work.
 *
 * Ownership:
 *   - This file owns *which* components exist and *what props they take*.
 *   - Replit owns how they look: classes, tokens, spacing, colour, motion.
 *
 * Restyling anything below the props boundary is safe and expected. Changing a
 * prop's shape is not — that requires updating `lib/contracts/src/manifest.ts`
 * first, or the server and the UI disagree about what a panel contains.
 *
 * The `Registry` type is exhaustive by construction: omit a component and this
 * file fails to compile. That is deliberate — it is the compile-time half of
 * the guarantee whose runtime half lives in `hydrate.ts`.
 *
 * The renderer does no fetching, no arithmetic, and no price derivation. Every
 * number arrives already correct. If a component needs data it doesn't have,
 * the fix is in hydration, never a `useEffect` here.
 */
import type { ComponentType as ReactComponentType, ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleAlert,
  Info,
  Minus,
  Package,
  ShoppingCart,
  X,
} from "lucide-react";
import type {
  ComponentType,
  ManifestSlot,
  Money,
  UIManifest,
} from "@workspace/contracts";

type PropsFor<T extends ComponentType> = Extract<ManifestSlot, { type: T }>["props"];
type Registry = { [K in ComponentType]: ReactComponentType<PropsFor<K>> };

// ── Shared primitives ─────────────────────────────────────────────────────────

const usd = (m: Money) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: m.currency }).format(
    m.amount / 100,
  );

function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-800/60 bg-gray-950/40 overflow-hidden">
      {title ? (
        <header className="px-4 py-2.5 border-b border-gray-800/60">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h3>
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Every empty state says what is missing. None render blank. */
function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-gray-500 italic">{children}</p>;
}

/** Model-authored prose is visually distinct from server-supplied fact. */
function AssistantNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-gray-400 border-l-2 border-yellow-400/40 pl-3 leading-relaxed">
      {children}
    </p>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function MissionSummary({ mission, headline, constraints }: PropsFor<"mission_summary">) {
  return (
    <Panel>
      <p className="text-xs uppercase tracking-wider text-yellow-400 mb-1">
        {mission.replace(/_/g, " ")}
      </p>
      <p className="text-white text-sm leading-relaxed">{headline}</p>
      {constraints.length > 0 && (
        <ul className="flex flex-wrap gap-2 mt-3">
          {constraints.map((c) => (
            <li
              key={c.label}
              className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${
                c.satisfied
                  ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/5"
                  : "border-gray-700 text-gray-400"
              }`}
            >
              {c.satisfied ? <Check className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {c.label}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ConfigurationDiagram({ nodes, edges }: PropsFor<"configuration_diagram">) {
  return (
    <Panel title="Configuration">
      <ol className="space-y-2">
        {nodes.map((n) => (
          <li key={n.handle} className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0 text-xs uppercase tracking-wide text-gray-500">
              {n.slotLabel}
            </span>
            <span className="text-white">{n.title}</span>
          </li>
        ))}
      </ol>
      {edges.length > 0 && (
        <ul className="mt-3 pt-3 border-t border-gray-800/60 space-y-1">
          {edges.map((e, i) => (
            <li key={`${e.from}-${e.to}-${i}`} className="text-xs text-gray-500">
              {e.from} → {e.to} · {e.label}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ProductCard({ component, rationale, addable }: PropsFor<"product_card">) {
  return (
    <Panel>
      <div className="flex gap-3">
        <div className="w-14 h-14 shrink-0 rounded bg-gray-900 border border-gray-700 flex items-center justify-center overflow-hidden">
          {component.imageUrl ? (
            <img src={component.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <Package className="w-5 h-5 text-gray-600" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white font-medium text-sm">{component.title}</p>
          <p className="text-xs text-gray-500">{component.vendor}</p>
          <p className="text-yellow-400 tabular-nums text-sm mt-1">
            {usd(component.commerce.price)}
          </p>
          {!addable && (
            <p className="text-xs text-gray-500 mt-1">Not currently available for sale</p>
          )}
        </div>
      </div>
      {rationale && <div className="mt-3">
        <AssistantNote>{rationale}</AssistantNote>
      </div>}
    </Panel>
  );
}

function ProductGrid({ title, items, emptyMessage }: PropsFor<"product_grid">) {
  return (
    <Panel title={title}>
      {items.length === 0 ? (
        <Empty>{emptyMessage}</Empty>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(({ component, compatible, compatibilityNote }) => (
            <li
              key={component.handle}
              className="rounded border border-gray-800/60 p-3 hover:bg-white/[0.02] transition-colors"
            >
              <p className="text-white text-sm font-medium truncate">{component.title}</p>
              <p className="text-yellow-400 tabular-nums text-sm mt-1">
                {usd(component.commerce.price)}
              </p>
              <p
                className={`text-xs mt-1 ${compatible ? "text-emerald-400" : "text-amber-400"}`}
              >
                {compatible ? "Compatible" : "Check compatibility"}
              </p>
              {compatibilityNote && (
                <p className="text-xs text-gray-500 mt-1">{compatibilityNote}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const RANK_STYLE: Record<string, string> = {
  best: "text-emerald-400",
  good: "text-emerald-300",
  adequate: "text-gray-300",
  poor: "text-amber-400",
  unknown: "text-gray-600 italic",
};

function ComparisonTable({
  subjects,
  rows,
  recommendedHandle,
  recommendationRationale,
}: PropsFor<"comparison_table">) {
  return (
    <Panel title="Comparison">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800/60">
              <th className="text-left py-2 pr-3 font-normal text-gray-500 text-xs uppercase tracking-wider">
                Spec
              </th>
              {subjects.map((s) => (
                <th key={s.handle} className="text-right py-2 px-3 text-white font-medium">
                  {s.title}
                  {recommendedHandle === s.handle && (
                    <span className="ml-2 text-[10px] uppercase text-yellow-400">Recommended</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.axis} className="border-b border-gray-800/40">
                <td className="py-2 pr-3 text-gray-400">
                  {row.label}
                  {row.unit && <span className="text-gray-600"> ({row.unit})</span>}
                </td>
                {row.cells.map((cell) => (
                  <td
                    key={cell.handle}
                    className={`py-2 px-3 text-right tabular-nums ${RANK_STYLE[cell.rank]}`}
                  >
                    {cell.display}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {recommendationRationale && (
        <div className="mt-3">
          <AssistantNote>{recommendationRationale}</AssistantNote>
        </div>
      )}
    </Panel>
  );
}

const SEVERITY_ICON = {
  blocker: <X className="w-4 h-4 text-red-400" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  info: <Info className="w-4 h-4 text-gray-400" />,
} as const;

function CompatibilityReport({
  status,
  confidence,
  findings,
  mass,
  power,
  rulesetVersion,
}: PropsFor<"compatibility_report">) {
  return (
    <Panel title="Compatibility">
      <p className="text-sm text-white mb-3">{status.replace(/_/g, " ")}</p>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <dt className="text-xs text-gray-500">Takeoff mass</dt>
          <dd className="text-white tabular-nums">{mass.totalG.toFixed(0)} g</dd>
          <dd className="text-xs text-gray-500 tabular-nums">
            {(mass.utilization * 100).toFixed(0)}% of {mass.maxTakeoffG.toFixed(0)} g
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Endurance</dt>
          {/* Always a range. A flat number is a promise the aircraft won't keep. */}
          <dd className="text-white tabular-nums">
            {power.estimatedFlightMinutes.toFixed(0)} ± {power.confidenceMinutes.toFixed(0)} min
          </dd>
          <dd className="text-xs text-gray-500">{power.model.replace(/_/g, " ")}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Total power</dt>
          <dd className="text-white tabular-nums">{power.totalW.toFixed(0)} W</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Verified pairs</dt>
          <dd className="text-white tabular-nums">{(confidence * 100).toFixed(0)}%</dd>
        </div>
      </dl>

      {findings.length > 0 && (
        <ul className="mt-4 space-y-2">
          {findings.map((f) => (
            <li key={`${f.ruleId}-${f.subjects.join()}`} className="flex gap-2 text-sm">
              <span className="mt-0.5 shrink-0">{SEVERITY_ICON[f.severity]}</span>
              <span className="text-gray-300">
                {f.message}
                <span className="text-gray-600 text-xs ml-2">{f.ruleId}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-gray-600 mt-4">Ruleset {rulesetVersion}</p>
    </Panel>
  );
}

function BomTable({ lines, subtotal, maxLeadTimeDays }: PropsFor<"bom_table">) {
  return (
    <Panel title="Bill of materials">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800/60 text-xs uppercase tracking-wider text-gray-500">
            <th className="text-left py-2 font-normal">Item</th>
            <th className="text-right py-2 px-3 font-normal">Unit</th>
            <th className="text-center py-2 px-3 font-normal">Qty</th>
            <th className="text-right py-2 font-normal">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.handle} className="border-b border-gray-800/40">
              <td className="py-2.5">
                <span className="text-white">{l.title}</span>
                <span className="block text-xs text-gray-600">{l.sku}</span>
                {!l.availableForSale && (
                  <span className="block text-xs text-amber-400">Not currently purchasable</span>
                )}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums text-gray-400">
                {usd(l.unitPrice)}
              </td>
              <td className="py-2.5 px-3 text-center tabular-nums text-gray-300">{l.quantity}</td>
              <td className="py-2.5 text-right tabular-nums text-yellow-400 font-semibold">
                {usd(l.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="py-2.5 text-right text-gray-400">
              Subtotal
            </td>
            <td className="py-2.5 text-right tabular-nums text-white font-semibold">
              {usd(subtotal)}
            </td>
          </tr>
        </tfoot>
      </table>
      {maxLeadTimeDays !== null && (
        <p className="text-xs text-gray-500 mt-2">Longest lead time: {maxLeadTimeDays} days</p>
      )}
    </Panel>
  );
}

function PriceSummary({
  subtotal,
  estimatedTax,
  estimatedShipping,
  total,
  pricedAt,
  disclaimer,
}: PropsFor<"price_summary">) {
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between text-sm py-1">
      <span className="text-gray-400">{label}</span>
      <span className="tabular-nums text-gray-200">{value}</span>
    </div>
  );

  return (
    <Panel title="Price">
      <Row label="Subtotal" value={usd(subtotal)} />
      {/* Null means Shopify computes it at checkout — we don't guess. */}
      <Row label="Tax" value={estimatedTax ? usd(estimatedTax) : "at checkout"} />
      <Row label="Shipping" value={estimatedShipping ? usd(estimatedShipping) : "at checkout"} />
      <div className="flex justify-between pt-2 mt-2 border-t border-gray-800/60">
        <span className="text-white font-semibold">Total</span>
        <span className="tabular-nums text-yellow-400 font-bold text-lg">{usd(total)}</span>
      </div>
      <p className="text-xs text-gray-600 mt-2">{disclaimer}</p>
      <p className="text-xs text-gray-700">Priced {new Date(pricedAt).toLocaleString()}</p>
    </Panel>
  );
}

function Alternatives({ title, items }: PropsFor<"alternatives">) {
  return (
    <Panel title={title}>
      {items.length === 0 ? (
        <Empty>No alternatives were considered for this build.</Empty>
      ) : (
        <ul className="space-y-3">
          {items.map(({ component, priceDelta, tradeoff }) => (
            <li key={component.handle} className="flex justify-between gap-4 text-sm">
              <div className="min-w-0">
                <p className="text-white">{component.title}</p>
                <p className="text-gray-500 text-xs">{tradeoff}</p>
              </div>
              <span
                className={`tabular-nums shrink-0 ${
                  priceDelta.amount > 0 ? "text-amber-400" : "text-emerald-400"
                }`}
              >
                {priceDelta.amount > 0 ? "+" : ""}
                {usd(priceDelta)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TechnicalSpecs({ title, groups }: PropsFor<"technical_specs">) {
  return (
    <Panel title={title}>
      {groups.map((g) => (
        <div key={g.label} className="mb-3 last:mb-0">
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">{g.label}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {g.rows.map((r) => (
              <div key={r.label} className="contents">
                <dt className="text-gray-400">{r.label}</dt>
                <dd className="text-gray-200 tabular-nums text-right">
                  {r.value}
                  {r.unit ? ` ${r.unit}` : ""}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </Panel>
  );
}

const BANNER_STYLE = {
  blocker: "border-red-500/40 bg-red-500/5",
  warning: "border-amber-500/40 bg-amber-500/5",
  info: "border-gray-700 bg-white/[0.02]",
} as const;

function WarningBanner({ severity, title, detail, ruleId }: PropsFor<"warning_banner">) {
  return (
    <div
      role={severity === "blocker" ? "alert" : "status"}
      className={`rounded-lg border p-4 flex gap-3 ${BANNER_STYLE[severity]}`}
    >
      <CircleAlert
        className={`w-5 h-5 shrink-0 ${
          severity === "blocker" ? "text-red-400" : severity === "warning" ? "text-amber-400" : "text-gray-400"
        }`}
      />
      <div>
        <p className="text-white text-sm font-medium">{title}</p>
        <p className="text-gray-400 text-sm mt-0.5">{detail}</p>
        {ruleId && <p className="text-gray-600 text-xs mt-1">{ruleId}</p>}
      </div>
    </div>
  );
}

function CheckoutCta({
  total,
  enabled,
  disabledReason,
  lineCount,
}: PropsFor<"checkout_cta">) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-white font-semibold text-lg tabular-nums">{usd(total)}</p>
          <p className="text-xs text-gray-500">
            {lineCount} item{lineCount === 1 ? "" : "s"} · continues on multirotors.store
          </p>
        </div>
        <button
          type="button"
          disabled={!enabled}
          aria-describedby={disabledReason ? "checkout-blocked" : undefined}
          className="inline-flex items-center gap-2 px-4 py-2 rounded font-medium text-sm bg-yellow-400 text-black hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ShoppingCart className="w-4 h-4" />
          Checkout
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
      {/* Never a bare greyed-out button — the reason is always stated. */}
      {disabledReason && (
        <p id="checkout-blocked" className="text-xs text-amber-400 mt-2">
          {disabledReason}
        </p>
      )}
    </Panel>
  );
}

function Explainer({ title, body, relatedHandles }: PropsFor<"explainer">) {
  return (
    <Panel title={title}>
      <AssistantNote>{body}</AssistantNote>
      {relatedHandles.length > 0 && (
        <p className="text-xs text-gray-600 mt-3">Related: {relatedHandles.join(", ")}</p>
      )}
    </Panel>
  );
}

// ── The registry ──────────────────────────────────────────────────────────────

export const REGISTRY: Registry = {
  mission_summary: MissionSummary,
  configuration_diagram: ConfigurationDiagram,
  product_card: ProductCard,
  product_grid: ProductGrid,
  comparison_table: ComparisonTable,
  compatibility_report: CompatibilityReport,
  bom_table: BomTable,
  price_summary: PriceSummary,
  alternatives: Alternatives,
  technical_specs: TechnicalSpecs,
  warning_banner: WarningBanner,
  checkout_cta: CheckoutCta,
  explainer: Explainer,
};

export function ManifestRenderer({ manifest }: { manifest: UIManifest }) {
  return (
    <div data-view={manifest.view} className="flex flex-col gap-4">
      {manifest.slots.map((slot, i) => {
        const Component = REGISTRY[slot.type] as ReactComponentType<typeof slot.props>;
        return (
          <div key={`${slot.type}-${i}`} data-emphasis={slot.emphasis}>
            <Component {...slot.props} />
          </div>
        );
      })}
    </div>
  );
}
