import type { FoodType } from "@/types";

export function FoodTypeMarker({ type }: { type: FoodType }) {
  if (type === "veg") {
    return (
      <span
        className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border-2 border-[#3f6653]"
        aria-label="Vegetarian"
        role="img"
      >
        <span className="h-2 w-2 rounded-full bg-[#3f6653]" />
      </span>
    );
  }
  if (type === "non_veg") {
    return (
      <span
        className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border-2 border-[#b6191a]"
        aria-label="Non-vegetarian"
        role="img"
      >
        {/* upward triangle */}
        <span
          className="block h-0 w-0"
          style={{
            borderLeft: "4px solid transparent",
            borderRight: "4px solid transparent",
            borderBottom: "7px solid #b6191a",
          }}
        />
      </span>
    );
  }
  // egg
  return (
    <span
      className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border-2 border-yellow-600"
      aria-label="Contains egg"
      role="img"
    >
      <span className="h-2 w-2 rounded-full bg-yellow-500" />
    </span>
  );
}
