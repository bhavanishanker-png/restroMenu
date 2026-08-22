"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  vegOnly: boolean;
  onVegOnlyChange: (v: boolean) => void;
  bestsellersOnly: boolean;
  onBestsellersOnlyChange: (v: boolean) => void;
  under200: boolean;
  onUnder200Change: (v: boolean) => void;
};

type ChipProps = {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function FilterChip({ active, onClick, children }: ChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-[#C2410C] bg-[#C2410C] text-white"
          : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

export function MenuFilters({
  search, onSearchChange,
  vegOnly, onVegOnlyChange,
  bestsellersOnly, onBestsellersOnlyChange,
  under200, onUnder200Change,
}: Props) {
  return (
    <div className="space-y-2 px-4 pt-3 pb-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search dishes..."
          className="h-9 w-full rounded-lg border border-stone-200 bg-stone-50 pl-9 pr-9 text-sm text-stone-900 placeholder:text-stone-400 focus:border-[#C2410C] focus:outline-none focus:ring-1 focus:ring-[#C2410C]"
          aria-label="Search dishes"
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        <FilterChip active={vegOnly} onClick={() => onVegOnlyChange(!vegOnly)}>
          Veg only
        </FilterChip>
        <FilterChip active={bestsellersOnly} onClick={() => onBestsellersOnlyChange(!bestsellersOnly)}>
          Bestsellers
        </FilterChip>
        <FilterChip active={under200} onClick={() => onUnder200Change(!under200)}>
          Under ₹200
        </FilterChip>
      </div>
    </div>
  );
}
