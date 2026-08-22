import { MenuItemCard } from "./MenuItemCard";
import type { MenuCategoryWithItems, MenuItem } from "@/types";

type Props = {
  category: MenuCategoryWithItems;
  onAddItem?: (item: MenuItem) => void;
};

export function MenuSection({ category, onAddItem }: Props) {
  return (
    <section id={`cat-${category.id}`} className="px-4 pt-6">
      <h2 className="mb-3 text-base font-semibold text-stone-800">{category.name}</h2>
      <div className="space-y-3">
        {category.items.map((item) => (
          <MenuItemCard key={item.id} item={item} onAdd={onAddItem} />
        ))}
      </div>
    </section>
  );
}
