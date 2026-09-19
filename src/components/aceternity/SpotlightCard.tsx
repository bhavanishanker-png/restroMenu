"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Card with a highlight that follows the cursor — the Aceternity card-spotlight
 * effect, implemented without Framer or React state.
 *
 * The pointer position is written straight to two CSS custom properties on the
 * node. Nothing re-renders on mousemove, so a grid of these costs no React
 * work at all; the browser only recomputes a gradient position on the
 * compositor.
 *
 * Touch devices never fire mousemove, so they simply get the static card —
 * which is why the border and surface must already look finished without it.
 */
export function SpotlightCard({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "article" | "li";
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMove = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    node.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      onMouseMove={handleMove}
      className={cn(
        "group/spot relative overflow-hidden rounded-2xl border border-outline-variant",
        "bg-surface-container-lowest shadow-level-1",
        "transition-[border-color,box-shadow,transform] duration-base ease-out-quart",
        "hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-level-2",
        className
      )}
    >
      {/* The highlight. Opacity is the only animated property on hover, and it
          is painted above the surface but below the content. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-base ease-out-quart group-hover/spot:opacity-100"
        style={{
          background:
            "radial-gradient(340px circle at var(--spot-x, 50%) var(--spot-y, 0px), hsl(var(--brand) / 0.14), transparent 70%)",
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </Tag>
  );
}
