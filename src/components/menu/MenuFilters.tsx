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
        "flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3.5",
        "font-label-bold text-label-bold uppercase",
        "transition-[background-color,border-color,color,box-shadow] duration-fast ease-out-quart",
        "active:scale-95",
        active
          ? "border-brand bg-brand text-brand-foreground shadow-glow"
          : "border-outline-variant bg-surface-container text-on-surface-variant hover:border-outline/50 hover:text-on-surface"
      )}
    >
      {/* A checkmark, not just a fill — the active state stays legible in
          greyscale and for anyone who can't rely on the colour shift. */}
      {active && (
        <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden="true">
          check
        </span>
      )}
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
    <div className="space-y-2 px-margin-mobile pb-xs pt-sm">
      {/* Search */}
      <div className="group relative">
        <span
          className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70 transition-colors group-focus-within:text-brand-text"
          style={{ fontSize: 18 }}
          aria-hidden="true"
        >
          search
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search dishes…"
          aria-label="Search dishes"
          className={cn(
            "h-11 w-full rounded-lg border border-outline-variant bg-surface-container pl-9 pr-9",
            "text-body-md text-on-surface placeholder:text-on-surface-variant/60",
            "transition-[border-color,box-shadow] duration-fast ease-out-quart",
            "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30",
            // Hide the WebKit clear affordance — we render our own, which is a
            // proper 44px target and matches the icon language.
            "[&::-webkit-search-cancel-button]:hidden"
          )}
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 grid h-11 w-9 -translate-y-1/2 place-items-center rounded-lg text-on-surface-variant/70 transition-colors hover:text-on-surface"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden="true">
              close
            </span>
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div
        role="group"
        aria-label="Filter dishes"
        className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
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
