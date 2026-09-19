import { cn } from "@/lib/utils"

/**
 * Loading states are skeletons, never spinners — a skeleton reserves the real
 * layout, so content arriving causes no shift.
 *
 * `.skeleton` (globals.css) is a sweeping shimmer rather than `animate-pulse`:
 * pulsing a whole screen of blocks in unison reads as a broken render, while a
 * directional sweep reads as loading. It stops under prefers-reduced-motion.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton rounded-lg", className)}
      aria-hidden="true"
      {...props}
    />
  )
}

export { Skeleton }
