import { HeaderSkeleton, PageBody, TableSkeleton } from "@/components/dashboard/PageSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-0">
      <HeaderSkeleton />
      <PageBody>
        <TableSkeleton rows={5} />
      </PageBody>
    </div>
  );
}
