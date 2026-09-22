import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartSkeleton,
  PageBody,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/dashboard/PageSkeleton";

export default function Loading() {
  return (
    <PageBody>
      {/* The overview builds its own header rather than using PageHeader. */}
      <div className="flex flex-col justify-between gap-md md:flex-row md:items-end">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-9 w-40 self-start rounded-full" />
      </div>

      <StatCardsSkeleton />

      <div className="grid grid-cols-1 gap-lg xl:grid-cols-3">
        <div className="flex flex-col gap-lg xl:col-span-2">
          <ChartSkeleton />
          <TableSkeleton rows={6} />
        </div>
        <TableSkeleton rows={4} />
      </div>
    </PageBody>
  );
}
