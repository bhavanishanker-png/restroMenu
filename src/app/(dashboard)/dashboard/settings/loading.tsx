import { Skeleton } from "@/components/ui/skeleton";
import { HeaderSkeleton } from "@/components/dashboard/PageSkeleton";

/** Mirrors SettingsForm: a heading column beside each section card. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-0">
      <HeaderSkeleton />
      <div className="p-margin-mobile md:p-5">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          {[3, 2, 2, 2].map((rows, section) => (
            <div key={section} className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
              <div className="flex items-start gap-3 lg:flex-col">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full max-w-[200px]" />
                </div>
              </div>
              <div className="divide-y divide-outline-variant rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-level-1">
                {Array.from({ length: rows }, (_, field) => (
                  <div key={field} className="flex flex-col gap-2 p-4 sm:p-5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-11 w-full max-w-sm" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
