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
      <div className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-container-high ring-1 ring-inset ring-outline-variant">
        {restaurant.logoUrl ? (
          <Image
            src={restaurant.logoUrl}
            alt=""
            fill
            sizes="36px"
            className="object-cover"
            priority
          />
        ) : (
          <span
            className="material-symbols-outlined text-on-surface-variant"
            style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            restaurant_menu
          </span>
        )}
      </div>

      {/* Name */}
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate font-display text-[1.0625rem] font-semibold leading-tight tracking-[-0.014em] text-on-surface">
          {restaurant.name}
        </h1>
        {restaurant.address && (
          <p className="truncate text-[0.6875rem] leading-tight text-on-surface-variant">
            {restaurant.address}
          </p>
        )}
      </div>

      <ThemeToggle className="h-9 w-9" />

      {/* Table badge */}
      {table && (
        <span className="shrink-0 rounded-full border border-brand-border bg-brand-subtle px-3 py-1 font-label-bold text-label-bold uppercase text-brand-text">
          Table {table.label}
        </span>
      )}
    </header>
  );
}
