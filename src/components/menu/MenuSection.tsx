import { MenuItemCard } from "./MenuItemCard";
import type { MenuCategoryWithItems, MenuItem } from "@/types";

type Props = {
  category: MenuCategoryWithItems;
  onAddItem?: (item: MenuItem) => void;
};

export function MenuSection({ category, onAddItem }: Props) {
  return (
    <section
      id={`cat-${category.id}`}
      aria-labelledby={`cat-heading-${category.id}`}
      // The fixed header + sticky search/chips/tab bar is ~206px tall. globals.css
      // already sets `scroll-padding-top: 6rem` (96px) on <html>, and the two
      // add up — so 120px here lands the section just below the tab bar.
      className="scroll-mt-[120px] px-margin-mobile pt-md"
    >
      <div className="mb-3 flex items-baseline gap-2">
        <h2
          id={`cat-heading-${category.id}`}
          className="font-display text-headline-sm text-on-surface"
        >
          {category.name}
        </h2>
        <span className="tabular text-body-xs text-on-surface-variant">
          {category.items.length} {category.items.length === 1 ? "dish" : "dishes"}
        </span>
      </div>

      <div className="space-y-3">
        {category.items.map((item) => (
          <MenuItemCard key={item.id} item={item} onAdd={onAddItem} />
        ))}
      </div>
    </section>
  );
}
