"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { Restaurant, RestaurantSettings, RestaurantTable } from "@/types";

type Props = {
  restaurant: Restaurant & { settings: RestaurantSettings };
  table: Pick<RestaurantTable, "id" | "label"> | null;
};

export function MenuHeader({ restaurant, table }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Server + initial client render: empty bar keeps extension injection outside hydration
  if (!mounted) {
    return (
      <header className="fixed top-0 left-0 right-0 z-30 h-[64px] bg-surface-container-low shadow-[0_1px_4px_rgba(0,0,0,0.08)]" />
    );
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-30 flex h-[64px] items-center gap-3 bg-surface-container-low px-4 shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
      {/* Logo */}
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-primary-container flex items-center justify-center border border-outline-variant/20">
        {restaurant.logoUrl ? (
          <Image
            src={restaurant.logoUrl}
            alt=""
            fill
            sizes="36px"
            className="object-cover"
          />
        ) : (
          <span
            className="material-symbols-outlined text-on-primary-container"
            style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}
          >
            restaurant_menu
          </span>
        )}
      </div>

      {/* Name */}
      <div className="flex flex-1 flex-col min-w-0">
        <h1 className="truncate font-headline-sm text-on-surface leading-tight" style={{ fontSize: 17 }}>
          {restaurant.name}
        </h1>
        {restaurant.address && (
          <p className="truncate font-body-sm text-on-surface-variant" style={{ fontSize: 11 }}>
            {restaurant.address}
          </p>
        )}
      </div>

      {/* Table badge */}
      {table && (
        <span className="shrink-0 rounded-full bg-primary-container px-3 py-1 font-label-bold text-on-primary-container" style={{ fontSize: 12 }}>
          Table {table.label}
        </span>
      )}
    </header>
  );
}
