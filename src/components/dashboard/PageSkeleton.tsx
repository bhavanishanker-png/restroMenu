import { Skeleton } from "@/components/ui/skeleton";

/**
 * Building blocks for the `loading.tsx` of each dashboard route.
 *
 * Every dashboard page is `force-dynamic`, so Next cannot prefetch its payload
 * and a navigation blocks on the server render — the old page just sat there
 * until the queries finished. A `loading.tsx` boundary is what makes the URL
 * change immediately and gives Next something to prefetch on link hover.
 *
 * These mirror the real layouts closely enough that nothing shifts on arrival.
 */

/** Matches `PageHeader`'s padding and type scale. */
export function HeaderSkeleton() {
  return (
    <header className="flex flex-col justify-between gap-3 border-b border-outline-variant bg-surface-container-low px-margin-mobile py-4 md:flex-row md:items-center md:px-margin-desktop">
      <div className="min-w-0 flex flex-col gap-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-9 w-32 shrink-0" />
    </header>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-sm md:gap-gutter lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex flex-col gap-xs rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-level-1"
        >
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-2 h-9 w-20" />
          <Skeleton className="mt-1 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** A bordered card wrapping evenly spaced rows — lists and tables alike. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-level-1">
      <div className="border-b border-outline-variant px-md py-sm">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex flex-col gap-1 p-2">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}

export function CardGridSkeleton({
  count = 8,
  height = "h-32",
}: {
  count?: number;
  height?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-sm md:grid-cols-3 md:gap-gutter lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={`${height} w-full rounded-xl`} />
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-level-1">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-4 h-52 w-full" />
    </div>
  );
}

/** Standard padded body for a dashboard route below its header. */
export function PageBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-lg p-margin-mobile md:p-margin-desktop">
      {children}
    </div>
  );
}
