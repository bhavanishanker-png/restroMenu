import type { FoodType } from "@/types";

export function FoodTypeMarker({ type }: { type: FoodType }) {
  if (type === "veg") {
    return (
      <span
        className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border-2 border-veg"
        aria-label="Vegetarian"
        role="img"
      >
        <span className="h-2 w-2 rounded-full bg-veg" />
      </span>
    );
  }
  if (type === "non_veg") {
    return (
      <span
        className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border-2 border-non-veg"
        aria-label="Non-vegetarian"
        role="img"
      >
        {/* upward triangle — the shape, not the colour, is the signal */}
        <span
          className="block h-0 w-0 border-b-[7px] border-l-4 border-r-4 border-l-transparent border-r-transparent border-b-non-veg"
        />
      </span>
    );
  }
  // egg
  return (
    <span
      className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border-2 border-egg"
      aria-label="Contains egg"
      role="img"
    >
      <span className="h-2 w-2 rounded-full bg-egg" />
    </span>
  );
}
