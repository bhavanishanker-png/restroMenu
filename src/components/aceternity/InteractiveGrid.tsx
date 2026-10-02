"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** Side of one grid box in px. Matches `.bg-line-grid` so both layers align. */
const CELL_SIZE = 64;

/**
 * Page-wide line grid that reacts to the cursor: a soft lens brightens the
 * lines around the pointer and the box under it lights up, gliding cell to
 * cell.
 *
 * The layer is `fixed` to the viewport and sits behind all content, so it
 * covers the whole page at the cost of one screen of paint — and because the
 * grid and the pointer share viewport coordinates, the highlighted box stays
 * aligned while the page scrolls underneath. It is `pointer-events-none` and
 * listens on `window`, so it never intercepts a click. Position is written
 * straight to CSS custom properties; nothing re-renders on pointermove.
 *
 * With `scope="parent"` it instead fills its nearest positioned ancestor and
 * tracks the pointer over that element only — for a grid inside one card.
 *
 * Touch and pen are ignored, so phones get the static grid, which is already
 * a finished background on its own.
 */
export function InteractiveGrid({
  className,
  scope = "viewport",
}: {
  className?: string;
  scope?: "viewport" | "parent";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const host = scope === "parent" ? node.parentElement : null;
    if (scope === "parent" && !host) return;

    let frame = 0;

    const handleMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // The viewport layer starts at 0,0; a contained one is offset.
        const rect = host ? node.getBoundingClientRect() : { left: 0, top: 0 };
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        node.style.setProperty("--grid-x", `${x}px`);
        node.style.setProperty("--grid-y", `${y}px`);
        node.style.setProperty("--cell-x", `${Math.floor(x / CELL_SIZE) * CELL_SIZE}px`);
        node.style.setProperty("--cell-y", `${Math.floor(y / CELL_SIZE) * CELL_SIZE}px`);
        node.dataset.active = "true";
      });
    };

    // Viewport scope: fires when the cursor leaves the browser window.
    const handleLeave = () => {
      cancelAnimationFrame(frame);
      delete node.dataset.active;
    };

    const moveTarget: HTMLElement | Window = host ?? window;
    const leaveTarget = host ?? document.documentElement;
    moveTarget.addEventListener("pointermove", handleMove as EventListener, { passive: true });
    leaveTarget.addEventListener("pointerleave", handleLeave);
    return () => {
      cancelAnimationFrame(frame);
      moveTarget.removeEventListener("pointermove", handleMove as EventListener);
      leaveTarget.removeEventListener("pointerleave", handleLeave);
    };
  }, [scope]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        "group/grid pointer-events-none inset-0 overflow-hidden",
        scope === "viewport" ? "fixed -z-10" : "absolute",
        className
      )}
    >
      {/* Resting grid: faint page-wide so long-form sections stay easy to
          read; inside a card it is stronger but fades out at the edges. */}
      <div
        className={cn(
          "absolute inset-0 bg-line-grid",
          scope === "viewport" ? "opacity-40" : "mask-radial opacity-90"
        )}
      />

      {/* Lens: the same grid in brand colour, revealed only near the cursor. */}
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-base ease-out-quart group-data-[active]/grid:opacity-100"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--brand) / 0.45) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--brand) / 0.45) 1px, transparent 1px)",
          backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
          maskImage:
            "radial-gradient(220px circle at var(--grid-x, 50%) var(--grid-y, 50%), #000, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(220px circle at var(--grid-x, 50%) var(--grid-y, 50%), #000, transparent 75%)",
        }}
      />

      {/* The box under the cursor. Its transform transition makes it glide
          between cells rather than jump. */}
      <div
        className="absolute left-0 top-0 border border-brand/40 bg-brand/10 opacity-0 transition-[transform,opacity] duration-base ease-out-quart group-data-[active]/grid:opacity-100"
        style={{
          width: CELL_SIZE + 1,
          height: CELL_SIZE + 1,
          transform: "translate(var(--cell-x, 0px), var(--cell-y, 0px))",
        }}
      />
    </div>
  );
}
