import {
  ChartSkeleton,
  HeaderSkeleton,
  PageBody,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/dashboard/PageSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-0">
      <HeaderSkeleton />
      <PageBody>
        <StatCardsSkeleton />
        <ChartSkeleton />
        <TableSkeleton rows={6} />
      </PageBody>
    </div>
  );
}
