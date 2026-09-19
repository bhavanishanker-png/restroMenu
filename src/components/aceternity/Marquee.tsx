import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Seamless infinite strip. The track is rendered twice and translated -50%,
 * so the second copy is exactly under the first when the loop restarts and
 * there is no visible jump.
 *
 * Server component — a CSS keyframe, no JS, no cloned nodes at runtime. The
 * duplicate is `aria-hidden` so assistive tech reads the list once.
 *
 * Paused on hover because a moving strip is unreadable if you actually want to
 * read it, and frozen entirely under prefers-reduced-motion by the global rule.
 */
export function Marquee({
  children,
  className,
  reverse = false,
}: {
  children: ReactNode;
  className?: string;
  reverse?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative flex w-full overflow-hidden",
        // Fade both ends so items enter and leave rather than being clipped.
        "[mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]",
        className
      )}
    >
      <div
        className={cn(
          "flex w-max shrink-0 animate-marquee items-center group-hover:[animation-play-state:paused]",
          reverse && "[animation-direction:reverse]"
        )}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
