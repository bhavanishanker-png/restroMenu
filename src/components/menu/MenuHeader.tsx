import Image from "next/image";
import type { Restaurant, RestaurantSettings, RestaurantTable } from "@/types";

type Props = {
  restaurant: Restaurant & { settings: RestaurantSettings };
  table: Pick<RestaurantTable, "id" | "label"> | null;
};

export function MenuHeader({ restaurant, table }: Props) {
  return (
    <header className="relative">
      {/* Cover image */}
      <div className="relative h-40 w-full bg-surface-container-high">
        {restaurant.coverUrl ? (
          <Image
            src={restaurant.coverUrl}
            alt={`${restaurant.name} cover`}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary-container/30 to-surface-container-highest" />
        )}
        {/* Gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-on-surface/40 to-transparent" />
      </div>

      {/* Info bar */}
      <div className="bg-surface-container-lowest shadow-level-1 px-4 pb-3 pt-3">
        <div className="flex items-center gap-3">
          {/* Logo */}
          {restaurant.logoUrl ? (
            <div className="relative -mt-8 h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 border-surface-container-lowest shadow-level-1">
              <Image
                src={restaurant.logoUrl}
                alt={`${restaurant.name} logo`}
                fill
                sizes="56px"
                className="object-cover"
              />
            </div>
          ) : (
            <div className="-mt-8 flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary-container shadow-level-1">
              <span className="material-symbols-outlined fill text-on-primary-container" style={{ fontSize: 28 }}>
                restaurant_menu
              </span>
            </div>
          )}

          <div className="flex flex-1 flex-col gap-0.5 min-w-0">
            <h1 className="font-headline-sm text-on-surface truncate">
              {restaurant.name}
            </h1>
            {restaurant.address && (
              <p className="flex items-center gap-1 text-body-sm text-on-surface-variant truncate">
                <span className="material-symbols-outlined sm" aria-hidden>location_on</span>
                {restaurant.address}
              </p>
            )}
          </div>

          {table && (
            <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-body-sm font-semibold text-primary">
              Table {table.label}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
