"use client";

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
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 font-label-bold text-label-bold transition-all active:scale-95",
        active
          ? "border-primary bg-primary text-on-primary"
          : "border-outline-variant bg-surface-container text-on-surface-variant hover:border-outline hover:bg-surface-container-high"
      )}
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
    <div className="space-y-2 px-margin-mobile pt-sm pb-xs">
      {/* Search */}
      <div className="relative group">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70 group-focus-within:text-primary transition-colors" style={{ fontSize: 18 }}>
          search
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search dishes…"
          aria-label="Search dishes"
          className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container pl-9 pr-9 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70 hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
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
