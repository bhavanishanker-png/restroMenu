import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while the menu is fetched on the server. Mirrors the real layout —
 * header, search, chips, tabs, dish cards — so the swap causes no shift.
 */
export default function MenuLoading() {
  return (
    <div className="min-h-screen bg-background" aria-busy="true" aria-label="Loading the menu">
      <div className="flex h-[64px] items-center gap-3 border-b border-outline-variant px-margin-mobile">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-7 w-14 rounded-full" />
      </div>
      <div className="space-y-2 border-b border-outline-variant px-margin-mobile pb-2 pt-2">
        <Skeleton className="h-11 w-full rounded-xl" />
        <div className="flex gap-2 py-1.5">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <div className="flex gap-5 py-2.5">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
      <div className="space-y-3 px-margin-mobile pt-md">
        <Skeleton className="h-6 w-32" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-[108px] w-[108px] shrink-0 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
