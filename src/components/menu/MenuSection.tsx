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
      // Offsets the sticky header + tab bar so a scroll-spy jump lands with the
      // heading visible rather than tucked underneath them.
      className="scroll-mt-[168px] px-margin-mobile pt-md"
    >
      <div className="mb-3 flex items-baseline gap-3">
        <h2
          id={`cat-heading-${category.id}`}
          className="font-display text-headline-sm text-on-surface"
        >
          {category.name}
        </h2>
        <span className="tabular text-body-sm text-on-surface-variant">
          {category.items.length}
        </span>
        <span aria-hidden="true" className="h-px flex-1 bg-outline-variant" />
      </div>

      <div className="space-y-3">
        {category.items.map((item) => (
          <MenuItemCard key={item.id} item={item} onAdd={onAddItem} />
        ))}
      </div>
    </section>
  );
}
