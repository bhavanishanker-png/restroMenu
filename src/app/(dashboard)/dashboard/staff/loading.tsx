import { Skeleton } from "@/components/ui/skeleton";
import { HeaderSkeleton } from "@/components/dashboard/PageSkeleton";

/** Mirrors StaffManager: filter toolbar, team list, roles card. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-0">
      <HeaderSkeleton />
      <div className="flex flex-col gap-4 p-margin-mobile md:p-5">
        <div className="flex items-center gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-level-1">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-24 shrink-0 rounded-full" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-level-1">
            <div className="border-b border-outline-variant bg-surface-container-low px-4 py-3">
              <Skeleton className="h-3.5 w-40" />
            </div>
            <div className="divide-y divide-outline-variant">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-level-1">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
