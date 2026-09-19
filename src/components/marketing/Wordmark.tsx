import { cn } from "@/lib/utils";

/**
 * The mark is a monochrome square with a single accent dot — the same
 * "neutral surface, one point of colour" rule the rest of the system follows,
 * at logo scale.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden="true"
        className="relative grid h-8 w-8 place-items-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground"
      >
        Q
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand ring-2 ring-background" />
      </span>
      <span className="font-display text-[1.0625rem] font-bold tracking-[-0.03em] text-on-surface">
        QBite
      </span>
    </span>
  );
}
