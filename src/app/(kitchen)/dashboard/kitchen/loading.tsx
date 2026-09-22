import { Skeleton } from "@/components/ui/skeleton";

/**
 * Four columns, matching the live board. Sized for the 10" tablet the kitchen
 * screen targets, so nothing jumps when the real orders land.
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-32" />
      </div>

      <div className="grid flex-1 grid-cols-2 gap-3 p-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, col) => (
          <div key={col} className="flex flex-col gap-3">
            <Skeleton className="h-6 w-28" />
            {Array.from({ length: col === 0 ? 3 : 2 }, (_, card) => (
              <Skeleton key={card} className="h-44 w-full rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
