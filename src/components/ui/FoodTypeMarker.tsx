import type { FoodType } from "@/types";

const STYLES: Record<FoodType, { border: string; dot: string; label: string }> = {
  veg: { border: "border-green-600", dot: "bg-green-600", label: "Veg" },
  non_veg: { border: "border-red-600", dot: "bg-red-600", label: "Non-veg" },
  egg: { border: "border-yellow-600", dot: "bg-yellow-600", label: "Contains egg" },
};

export function FoodTypeMarker({ type }: { type: FoodType }) {
  const s = STYLES[type];
  return (
    <span
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border-2 ${s.border}`}
      aria-label={s.label}
      role="img"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
    </span>
  );
}
