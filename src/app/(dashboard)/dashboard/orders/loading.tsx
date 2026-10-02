import { Skeleton } from "@/components/ui/skeleton";
import { HeaderSkeleton, TableSkeleton } from "@/components/dashboard/PageSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-0">
      <HeaderSkeleton />
      <div className="flex flex-col gap-4 p-5">
        {/* Toolbar: search, date presets, date range, export — then status chips */}
        <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-11 min-w-[200px] flex-1 lg:max-w-sm" />
            <Skeleton className="h-11 w-72 rounded-xl" />
            <Skeleton className="h-11 w-80" />
            <Skeleton className="h-11 w-32 lg:ml-auto" />
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-24 rounded-full" />
            ))}
          </div>
        </div>
        <Skeleton className="h-5 w-48" />
        <TableSkeleton rows={8} />
      </div>
    </div>
  );
}
