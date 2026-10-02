import { Skeleton } from "@/components/ui/skeleton";

/** Layout-matched placeholder for the cart and checkout screens. */
export function CartPageSkeleton({ withHeader = true }: { withHeader?: boolean }) {
  return (
    <div className="min-h-screen bg-surface" aria-busy="true" aria-label="Loading your cart">
      {withHeader && (
        <div className="flex h-[64px] items-center gap-3 border-b border-outline-variant px-margin-mobile">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="ml-auto h-7 w-20 rounded-full" />
        </div>
      )}
      <div className="space-y-4 px-margin-mobile pt-4">
        <div className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-11 w-32 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      </div>
    </div>
  );
}
