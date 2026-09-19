import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
import { cn } from "@/lib/utils";

/**
 * The hero visual, built from real DOM instead of a screenshot.
 *
 * The previous hero loaded three avatar JPEGs and a product shot from
 * `lh3.googleusercontent.com` — third-party URLs with no fixed dimensions,
 * so they cost a DNS hop, a render-blocking fetch and a guaranteed layout
 * shift, and would simply break if the links rotted. This renders instantly,
 * scales crisply, and inherits the theme.
 *
 * It is decorative: `aria-hidden`, and the surrounding copy carries the
 * meaning. Nothing here is a real order.
 */

const MENU_ROWS = [
  { name: "Paneer Tikka", price: "₹320", type: "veg" as const, tag: "Bestseller" },
  { name: "Butter Chicken", price: "₹420", type: "non_veg" as const },
  { name: "Egg Kathi Roll", price: "₹180", type: "egg" as const },
];

const KITCHEN_TICKETS = [
  { no: "#214", table: "T7", mins: "2m", state: "new" as const },
  { no: "#213", table: "T2", mins: "9m", state: "prep" as const },
  { no: "#211", table: "T9", mins: "17m", state: "late" as const },
];

export function ProductPreview() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[520px] select-none">
      {/* Accent bloom behind the devices. */}
      <div className="absolute inset-x-8 top-10 -z-10 h-64 rounded-full bg-brand/20 blur-[90px]" />

      {/* ── Kitchen display card (back) ── */}
      <div className="edge-light ml-auto w-[88%] rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-level-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-label-bold text-label-bold uppercase text-on-surface-variant">
            Kitchen display
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-success/25 bg-success-container px-2 py-0.5 font-label-bold text-label-bold uppercase text-on-success-container">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Live
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {KITCHEN_TICKETS.map((ticket) => (
            <div
              key={ticket.no}
              className={cn(
                "rounded-lg border bg-surface-container p-2.5",
                // Urgency escalates by border *weight* as well as colour, the
                // same rule the real kitchen display follows.
                ticket.state === "late"
                  ? "border-2 border-error"
                  : ticket.state === "prep"
                    ? "border-warning/60"
                    : "border-outline-variant"
              )}
            >
              <p className="tabular font-mono text-base font-bold leading-none text-on-surface">
                {ticket.no}
              </p>
              <p className="mt-1 text-[11px] leading-none text-on-surface-variant">
                {ticket.table} · {ticket.mins}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Customer menu phone (front) ── */}
      <div className="edge-light absolute -bottom-10 left-0 w-[58%] max-w-[230px] rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-level-3">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-surface-container-high text-[10px] font-bold text-on-surface-variant">
            T
          </span>
          <span className="flex-1 truncate text-[11px] font-semibold text-on-surface">
            Tandoori Hut
          </span>
          <span className="rounded-full border border-brand-border bg-brand-subtle px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-text">
            T7
          </span>
        </div>

        <div className="space-y-1.5">
          {MENU_ROWS.map((row) => (
            <div
              key={row.name}
              className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container px-2 py-1.5"
            >
              <span className="scale-[0.7]">
                <FoodTypeMarker type={row.type} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-on-surface">
                {row.name}
              </span>
              <span className="tabular text-[11px] font-semibold text-on-surface-variant">
                {row.price}
              </span>
            </div>
          ))}
        </div>

        {/* The floating cart bar, in miniature. */}
        <div className="mt-2.5 flex items-center justify-between rounded-lg bg-brand px-2.5 py-2 shadow-glow">
          <span className="text-[10px] font-bold uppercase tracking-wide text-brand-foreground">
            3 items
          </span>
          <span className="tabular text-[11px] font-bold text-brand-foreground">₹920</span>
        </div>
      </div>
    </div>
  );
}
