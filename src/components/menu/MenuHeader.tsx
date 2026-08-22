import Image from "next/image";
import { MapPin } from "lucide-react";
import type { Restaurant, RestaurantSettings, RestaurantTable } from "@/types";

type Props = {
  restaurant: Restaurant & { settings: RestaurantSettings };
  table: Pick<RestaurantTable, "id" | "label"> | null;
};

export function MenuHeader({ restaurant, table }: Props) {
  return (
    <header className="relative">
      {/* Cover image */}
      <div className="relative h-36 w-full bg-stone-200">
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
          <div className="h-full w-full bg-gradient-to-br from-[#C2410C]/20 to-stone-300" />
        )}
      </div>

      {/* Restaurant info bar */}
      <div className="flex items-center gap-3 bg-white px-4 py-3 shadow-sm">
        {/* Logo */}
        {restaurant.logoUrl && (
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-white shadow-sm">
            <Image
              src={restaurant.logoUrl}
              alt={`${restaurant.name} logo`}
              fill
              sizes="48px"
              className="object-cover"
            />
          </div>
        )}

        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <h1 className="truncate text-base font-bold text-stone-900">
            {restaurant.name}
          </h1>
          {restaurant.address && (
            <p className="flex items-center gap-1 truncate text-xs text-stone-500">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              {restaurant.address}
            </p>
          )}
        </div>

        {table && (
          <span className="shrink-0 rounded-full bg-[#C2410C]/10 px-3 py-1 text-xs font-semibold text-[#C2410C]">
            Table {table.label}
          </span>
        )}
      </div>
    </header>
  );
}
