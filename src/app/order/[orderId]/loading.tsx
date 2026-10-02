import { Skeleton } from "@/components/ui/skeleton";

export default function OrderTrackerLoading() {
  return (
    <div className="min-h-screen bg-surface" aria-busy="true" aria-label="Loading your order">
      <div className="flex h-[56px] items-center justify-center border-b border-outline-variant">
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="mx-auto max-w-md space-y-4 px-margin-mobile pt-4">
        <div className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex gap-3">
            <Skeleton className="h-12 w-12 shrink-0 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="space-y-5 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
