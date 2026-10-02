import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the overview layout in `page.tsx` so nothing shifts on arrival. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-margin-mobile md:p-margin-desktop" aria-busy="true">
      <span className="sr-only">Loading dashboard</span>

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-11 w-48 self-start rounded-xl md:self-auto" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-level-1 md:p-5"
          >
            <div className="flex items-start justify-between">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-9 w-9 rounded-xl md:h-11 md:w-11" />
            </div>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3.5 w-28 max-w-full" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-level-1 md:p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-3.5 w-48" />
            <Skeleton className="mt-5 h-[180px] w-full md:h-[200px]" />
          </div>
          <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-level-1">
            <div className="border-b border-outline-variant px-4 py-3 md:px-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-3.5 w-40" />
            </div>
            <div className="flex flex-col gap-2 p-3">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-3.5 w-28" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[112px] w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
