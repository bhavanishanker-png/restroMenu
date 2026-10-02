import { HeaderSkeleton } from "@/components/dashboard/PageSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors MenuManager: category sidebar (lg+) or chip strip, then dish rows. */
export default function Loading() {
  return (
    <div className="flex h-screen flex-col bg-surface">
      <HeaderSkeleton />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[296px] shrink-0 flex-col gap-1 border-r border-outline-variant bg-surface-container-lowest px-2 pt-4 lg:flex">
          <div className="mb-2 space-y-1.5 px-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-xl" />
          ))}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex gap-1.5 overflow-hidden border-b border-outline-variant bg-surface-container-lowest px-4 py-3 lg:hidden">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-28 shrink-0 rounded-full" />
            ))}
          </div>
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1.5">
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-11 w-32 rounded-lg" />
            </div>
            <Skeleton className="h-[68px] w-full rounded-2xl" />
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-level-1"
              >
                <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3.5 w-1/4" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
