import { Flame } from "lucide-react";

/**
 * Spice is communicated by the *count* of flames as well as the colour, and
 * carries an explicit label for screen readers — so it survives both greyscale
 * and non-visual reading.
 */
export function SpiceLevel({ level }: { level: number }) {
  if (level <= 0) return null;
  const capped = Math.min(level, 3);

  return (
    <span
      aria-label={`Spice level ${capped} of 3`}
      role="img"
      className="flex items-center gap-0.5"
    >
      {Array.from({ length: capped }).map((_, i) => (
        <Flame key={i} className="h-3 w-3 fill-warning text-warning" aria-hidden="true" />
      ))}
    </span>
  );
}
