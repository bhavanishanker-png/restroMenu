import { cn } from "@/lib/utils";

/** Material Symbols glyph, decorative. Matches the icon usage in Orders/KDS. */
export function MsIcon({
  name,
  size = 18,
  filled = false,
  className,
}: {
  name: string;
  size?: number;
  filled?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("material-symbols-outlined shrink-0 leading-none", className)}
      style={{
        fontSize: size,
        ...(filled ? { fontVariationSettings: "'FILL' 1" } : null),
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
