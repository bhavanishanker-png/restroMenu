"use client";

import { useMemo } from "react";
import { MenuItemCard } from "@/components/menu/MenuItemCard";
import { formatMoney } from "@/lib/pricing";
import type { MenuItem } from "@/types";

type Props = {
  items: MenuItem[];
  categoryName: string;
};

/**
 * The right rail on the menu manager.
 *
 * Two things a manager actually wants while editing a category: the numbers
 * they'd otherwise count by hand, and confirmation of what a guest ends up
 * seeing. The preview renders the real `MenuItemCard` with the real data
 * rather than a mock, so it cannot drift from the customer menu.
 */
export function CategoryInsights({ items, categoryName }: Props) {
  const stats = useMemo(() => {
    const available = items.filter((i) => i.isAvailable).length;
    const prices = items.map((i) => i.basePrice);
    const byType = {
      veg: items.filter((i) => i.foodType === "veg").length,
      non_veg: items.filter((i) => i.foodType === "non_veg").length,
      egg: items.filter((i) => i.foodType === "egg").length,
    };
    const missingImages = items.filter((i) => !i.imageUrl).length;
    const missingDescriptions = items.filter((i) => !i.description).length;

    return {
      total: items.length,
      available,
      unavailable: items.length - available,
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
      byType,
      missingImages,
      missingDescriptions,
    };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <aside
      aria-label={`${categoryName} summary and guest preview`}
      // 400px so the preview's inner width lands near a real 375px phone
      // viewport minus its gutters. Narrower than that and the preview would
      // wrap dish names that do not actually wrap on a phone — a preview that
      // lies is worse than no preview.
      // `overflow-hidden`, not `auto`: only the phone frame scrolls, so there
      // is never a scrollbar inside a scrollbar.
      className="hidden w-[400px] shrink-0 flex-col gap-4 overflow-hidden border-l border-outline-variant bg-surface-container-low p-5 2xl:flex"
    >
      {/* ── At a glance ─────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-3 font-label-bold text-label-bold uppercase text-on-surface-variant">
          At a glance
        </h3>

        <dl className="grid grid-cols-2 gap-2">
          <Stat label="Items" value={String(stats.total)} />
          <Stat
            label="Available"
            value={`${stats.available}/${stats.total}`}
            tone={stats.unavailable > 0 ? "warning" : "success"}
          />
          <Stat
            label="Lowest"
            value={formatMoney(stats.min)}
            className="col-span-1"
          />
          <Stat label="Highest" value={formatMoney(stats.max)} />
        </dl>

        {/* Food-type split. The dot colours repeat the marker language from
            the customer menu, and each is labelled, so this never relies on
            colour alone. */}
        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {[
            { key: "veg", label: "Veg", n: stats.byType.veg, dot: "bg-veg" },
            { key: "non_veg", label: "Non-veg", n: stats.byType.non_veg, dot: "bg-non-veg" },
            { key: "egg", label: "Egg", n: stats.byType.egg, dot: "bg-egg" },
          ]
            .filter((t) => t.n > 0)
            .map((t) => (
              <li key={t.key} className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
                <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden="true" />
                <span className="tabular font-semibold text-on-surface">{t.n}</span>
                {t.label}
              </li>
            ))}
        </ul>
      </section>

      {/* ── Things worth fixing ─────────────────────────────────────── */}
      {(stats.missingImages > 0 || stats.missingDescriptions > 0) && (
        <section className="rounded-xl border border-outline-variant bg-surface-container p-3">
          <h3 className="mb-2 font-label-bold text-label-bold uppercase text-on-surface-variant">
            Worth finishing
          </h3>
          <ul className="space-y-1.5">
            {stats.missingImages > 0 && (
              <Gap
                n={stats.missingImages}
                total={stats.total}
                noun="without a photo"
                hint="Dishes with photos get ordered noticeably more."
              />
            )}
            {stats.missingDescriptions > 0 && (
              <Gap
                n={stats.missingDescriptions}
                total={stats.total}
                noun="without a description"
                hint="Guests can't ask a waiter what's in it."
              />
            )}
          </ul>
        </section>
      )}

      {/* ── Guest preview ───────────────────────────────────────────── */}
      <section className="flex min-h-0 flex-1 flex-col">
        <h3 className="mb-3 font-label-bold text-label-bold uppercase text-on-surface-variant">
          What guests see
        </h3>

        {/* Phone frame. Inner width is close to a real 375px viewport minus
            its gutters, so the cards lay out exactly as they will on a phone
            rather than at some arbitrary rail width. */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-outline-variant bg-background shadow-level-2">
          <div className="flex items-center gap-2 border-b border-outline-variant bg-surface-container-low px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-outline" aria-hidden="true" />
            <span className="truncate text-[11px] font-semibold text-on-surface-variant">
              {categoryName}
            </span>
          </div>

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
            {items.slice(0, 4).map((item) => (
              // Not interactive here — this is a preview, so no onAdd handler
              // is passed and the button is a no-op.
              <MenuItemCard key={item.id} item={item} />
            ))}
            {items.length > 4 && (
              <p className="pt-1 text-center text-[11px] text-on-surface-variant">
                + {items.length - 4} more on the live menu
              </p>
            )}
          </div>
        </div>
      </section>
    </aside>
  );
}

function Stat({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
  className?: string;
}) {
  const toneClass =
    tone === "warning"
      ? "text-on-warning-container"
      : tone === "success"
        ? "text-on-success-container"
        : "text-on-surface";

  return (
    <div className={`rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 ${className ?? ""}`}>
      <dt className="text-[11px] uppercase tracking-wide text-on-surface-variant">{label}</dt>
      <dd className={`tabular font-display text-[1.0625rem] font-semibold ${toneClass}`}>
        {value}
      </dd>
    </div>
  );
}

function Gap({
  n,
  total,
  noun,
  hint,
}: {
  n: number;
  total: number;
  noun: string;
  hint: string;
}) {
  return (
    <li className="text-body-sm text-on-surface-variant">
      <span className="tabular font-semibold text-on-surface">
        {n} of {total}
      </span>{" "}
      {noun}.{" "}
      <span className="text-on-surface-variant/90">{hint}</span>
    </li>
  );
}
