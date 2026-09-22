import { Skeleton } from "@/components/ui/skeleton";
import { HeaderSkeleton, PageBody } from "@/components/dashboard/PageSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-0">
      <HeaderSkeleton />
      <PageBody>
        {/* Settings is a stack of form cards, each a few labelled fields. */}
        {Array.from({ length: 3 }, (_, card) => (
          <div
            key={card}
            className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-level-1"
          >
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 3 }, (_, field) => (
              <div key={field} className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-10 w-full max-w-md" />
              </div>
            ))}
          </div>
        ))}
      </PageBody>
    </div>
  );
}
