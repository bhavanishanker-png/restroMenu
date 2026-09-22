import { CardGridSkeleton, HeaderSkeleton, PageBody } from "@/components/dashboard/PageSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-0">
      <HeaderSkeleton />
      <PageBody>
        <CardGridSkeleton count={8} height="h-40" />
      </PageBody>
    </div>
  );
}
