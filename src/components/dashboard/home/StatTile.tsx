import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: ReactNode;
  /** Material Symbols name. */
  icon: string;
  /** One line under the value that says what the number means. */
  caption: ReactNode;
  /** The one tile that needs acting on carries the accent. */
  accent?: boolean;
};

/** KPI tile: label, a large value, and a caption. Server component. */
export function StatTile({ label, value, icon, caption, accent = false }: Props) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border p-4 shadow-level-1 md:p-5",
        accent
          ? "border-brand-border bg-brand-subtle"
          : "border-outline-variant bg-surface-container-lowest"
      )}
    >
      {accent && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-brand/25 blur-2xl"
        />
      )}
      <div className="relative flex items-start justify-between gap-2">
        <span
          className={cn(
            "pt-1 text-body-sm font-semibold leading-tight",
            accent ? "text-brand-text" : "text-on-surface-variant"
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-lg border md:h-11 md:w-11 md:rounded-xl",
            accent
              ? "border-brand-border bg-surface-container-lowest text-brand-text"
              : "border-outline-variant bg-surface-container-low text-on-surface-variant"
          )}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden="true">
            {icon}
          </span>
        </span>
      </div>
      <div className="relative truncate font-display text-[28px] font-bold leading-none text-on-surface md:text-[34px]">
        {value}
      </div>
      <div className="relative min-w-0 text-body-sm text-on-surface-variant">{caption}</div>
    </div>
  );
}
