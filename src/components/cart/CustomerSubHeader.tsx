import Link from "next/link";

/** Shared top bar for the cart and checkout screens. */
export function CustomerSubHeader({
  backHref,
  backLabel,
  title,
  subtitle,
  tableLabel,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: string | null;
  tableLabel: string | null;
}) {
  return (
    <header className="glass-strong sticky top-0 z-10 flex h-[64px] items-center gap-2 border-x-0 border-t-0 pl-2 pr-margin-mobile">
      <Link
        href={backHref}
        aria-label={backLabel}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-on-surface transition-colors hover:bg-surface-container"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 24 }} aria-hidden="true">arrow_back</span>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate font-display text-title leading-tight text-on-surface">{title}</h1>
        {subtitle && <p className="tabular text-[0.75rem] leading-tight text-on-surface-variant">{subtitle}</p>}
      </div>
      {tableLabel && (
        <span className="flex shrink-0 items-center gap-1 rounded-full border border-brand-border bg-brand-subtle py-1 pl-2 pr-2.5 text-brand-text">
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            table_restaurant
          </span>
          <span className="tabular text-[0.8125rem] font-semibold leading-none">Table {tableLabel}</span>
        </span>
      )}
    </header>
  );
}
