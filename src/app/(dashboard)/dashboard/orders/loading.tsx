import { Skeleton } from "@/components/ui/skeleton";
import { HeaderSkeleton, TableSkeleton } from "@/components/dashboard/PageSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-0">
      <HeaderSkeleton />
      <div className="flex flex-col gap-4 p-5">
        {/* Filter bar: search, date range, status, export */}
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-full min-w-[180px] max-w-xs flex-1" />
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-9 w-32" />
        </div>
        <TableSkeleton rows={8} />
      </div>
    </div>
  );
}
