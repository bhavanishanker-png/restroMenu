import { cn } from "@/lib/utils";

/**
 * Slow-drifting colour wash behind a hero. Three blurred radial blobs on
 * offset loops — enough to feel alive, far below the threshold where motion
 * competes with the copy.
 *
 * Server component: CSS keyframes only, no JS. Masked at the edges so it never
 * touches the section boundary, and held at low opacity so the page stays a
 * black-and-white page with a hint of accent rather than a gradient poster.
 */
export function Aurora({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden mask-radial",
        className
      )}
    >
      <div
        className="absolute -left-[10%] top-[-20%] h-[520px] w-[520px] rounded-full bg-brand/25 blur-[120px] animate-aurora will-change-transform"
        style={{ animationDelay: "0s" }}
      />
      <div
        className="absolute right-[-8%] top-[5%] h-[440px] w-[440px] rounded-full bg-brand/15 blur-[130px] animate-aurora will-change-transform"
        style={{ animationDelay: "-6s", animationDuration: "22s" }}
      />
      {/* Neutral blob keeps the wash from reading as "purple gradient". */}
      <div
        className="absolute bottom-[-25%] left-[35%] h-[480px] w-[480px] rounded-full bg-foreground/[0.07] blur-[110px] animate-aurora will-change-transform"
        style={{ animationDelay: "-12s", animationDuration: "26s" }}
      />
    </div>
  );
}
