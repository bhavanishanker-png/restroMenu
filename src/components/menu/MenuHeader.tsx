"use client";

import Image from "next/image";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { Restaurant, RestaurantSettings, RestaurantTable } from "@/types";

type Props = {
  restaurant: Restaurant & { settings: RestaurantSettings };
  table: Pick<RestaurantTable, "id" | "label"> | null;
};

/**
 * This used to gate its own markup behind a `mounted` flag, which meant the
 * restaurant name was absent from the server HTML and the bar rendered empty
 * on first paint — a visible blank on the app's highest-traffic screen. The
 * markup is deterministic (it only reads props), and extension-injected nodes
 * are already covered by `suppressHydrationWarning` on <body>, so the gate is
 * gone and the header is server-rendered. Same fix as the one applied to
 * LoginForm.
 */
export function MenuHeader({ restaurant, table }: Props) {
  return (
    <header className="glass-strong fixed inset-x-0 top-0 z-30 flex h-[64px] items-center gap-3 border-x-0 border-t-0 px-margin-mobile">
      {/* Logo */}
      <div className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-subtle ring-1 ring-inset ring-brand-border">
        {restaurant.logoUrl ? (
          <Image
            src={restaurant.logoUrl}
            alt=""
            fill
            sizes="40px"
            className="object-cover"
            priority
          />
        ) : (
          <span
            className="material-symbols-outlined text-brand-text"
            style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            restaurant_menu
          </span>
        )}
      </div>

      {/* Name */}
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate font-display text-title leading-tight text-on-surface">
          {restaurant.name}
        </h1>
        {restaurant.address && (
          <p className="truncate text-[0.6875rem] leading-tight text-on-surface-variant">
            {restaurant.address}
          </p>
        )}
      </div>

      {/* Table badge — icon + label, so it still reads in greyscale. */}
      {table && (
        <span
          className="flex shrink-0 items-center gap-1 rounded-full border border-brand-border bg-brand-subtle py-1 pl-2 pr-2.5 text-brand-text"
          aria-label={`You are at table ${table.label}`}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            table_restaurant
          </span>
          <span className="tabular text-[0.8125rem] font-semibold leading-none">
            {table.label}
          </span>
        </span>
      )}

      <ThemeToggle className="-mr-1.5 h-11 w-11 shrink-0" />
    </header>
  );
}
