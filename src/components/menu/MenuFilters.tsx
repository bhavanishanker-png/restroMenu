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
  icon: React.ReactNode;
  children: React.ReactNode;
};

/**
 * The chip *looks* 32px tall, but the button around it is 44px — the
 * customer-screen tap-target minimum — so the filter row stays compact without
 * shrinking the touch area. Vertical padding on the button supplies the rest.
 */
function FilterChip({ active, onClick, icon, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="group flex min-h-[44px] shrink-0 items-center"
    >
      <span
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-full border pl-2 pr-3 text-[0.8125rem] font-semibold",
          "transition-[background-color,border-color,color] duration-fast ease-out-quart group-active:scale-95",
          active
            ? "border-brand-border bg-brand-subtle text-brand-text"
            : "border-outline-variant bg-surface-container-lowest text-on-surface-variant group-hover:border-outline/50 group-hover:text-on-surface"
        )}
      >
        {/* A checkmark replaces the icon when active — the state stays legible
            in greyscale and for anyone who can't rely on the colour shift. */}
        {active ? (
          <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">
            check
          </span>
        ) : (
          icon
        )}
        {children}
      </span>
    </button>
  );
}

function ChipIcon({ name }: { name: string }) {
  return (
    <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">
      {name}
    </span>
  );
}

export function MenuFilters({
  search, onSearchChange,
  vegOnly, onVegOnlyChange,
  bestsellersOnly, onBestsellersOnlyChange,
  under200, onUnder200Change,
}: Props) {
  return (
    <div className="px-margin-mobile pt-2">
      {/* Search */}
      <div className="group relative">
        <span
          className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70 transition-colors group-focus-within:text-brand-text"
          style={{ fontSize: 20 }}
          aria-hidden="true"
        >
          search
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search dishes"
          aria-label="Search dishes"
          enterKeyHint="search"
          className={cn(
            "h-11 w-full rounded-xl border border-outline-variant bg-surface-container-lowest pl-10 pr-11",
            "text-body-md text-on-surface placeholder:text-on-surface-variant/70",
            "transition-[border-color,box-shadow] duration-fast ease-out-quart",
            "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30",
            // Hide the WebKit clear affordance — we render our own, which is a
            // proper 44px target and matches the icon language.
            "[&::-webkit-search-cancel-button]:hidden"
          )}
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <span
              className="grid h-6 w-6 place-items-center rounded-full bg-surface-container-high"
              aria-hidden="true"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                close
              </span>
            </span>
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div
        role="group"
        aria-label="Filter dishes"
        className="-mx-margin-mobile flex gap-2 overflow-x-auto px-margin-mobile [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <FilterChip
          active={vegOnly}
          onClick={() => onVegOnlyChange(!vegOnly)}
          // The FSSAI square-dot, drawn small — the chip says "veg" by shape,
          // not by its green.
          icon={
            <span
              className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border-[1.5px] border-veg"
              aria-hidden="true"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-veg" />
            </span>
          }
        >
          Veg only
        </FilterChip>
        <FilterChip
          active={bestsellersOnly}
          onClick={() => onBestsellersOnlyChange(!bestsellersOnly)}
          icon={<ChipIcon name="local_fire_department" />}
        >
          Bestsellers
        </FilterChip>
        <FilterChip
          active={under200}
          onClick={() => onUnder200Change(!under200)}
          icon={<ChipIcon name="savings" />}
        >
          Under ₹200
        </FilterChip>
      </div>
    </div>
  );
}
