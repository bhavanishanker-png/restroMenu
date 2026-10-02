import { Skeleton } from "@/components/ui/skeleton";
import { HeaderSkeleton } from "@/components/dashboard/PageSkeleton";

/** Mirrors SettingsForm: the section menu beside a stack of section cards. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-0">
      <HeaderSkeleton />
      <div className="p-margin-mobile md:p-5">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-8">
          {/* Section menu: chips on phones, a list from lg up. */}
          <div className="flex gap-1.5 overflow-hidden lg:flex-col lg:gap-1">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11 w-36 shrink-0 rounded-full lg:h-[60px] lg:w-full lg:rounded-xl" />
            ))}
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            {[4, 2, 3, 2].map((rows, section) => (
              <div
                key={section}
                className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-level-1"
              >
                <div className="flex items-start gap-3 border-b border-outline-variant bg-surface-container-low px-4 py-4 sm:px-5">
                  <Skeleton className="h-11 w-11 rounded-xl" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-full max-w-[260px]" />
                  </div>
                </div>
                <div className="divide-y divide-outline-variant">
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
    </div>
  );
}
