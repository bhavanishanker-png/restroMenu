import { Flame } from "lucide-react";

export function SpiceLevel({ level }: { level: number }) {
  if (level === 0) return null;
  return (
    <span
      aria-label={`Spice level ${level} of 3`}
      role="img"
      className="flex items-center gap-0.5"
    >
      {Array.from({ length: level }).map((_, i) => (
        <Flame key={i} className="h-3 w-3 fill-red-500 text-red-500" />
      ))}
    </span>
  );
}
