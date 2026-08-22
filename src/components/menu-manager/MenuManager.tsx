"use client";

import { useState } from "react";
import type { AddonGroup, MenuCategory } from "@/types";
import { CategoryList } from "./CategoryList";
import { ItemList } from "./ItemList";

type CategoryWithCount = MenuCategory & { itemCount: number };

type Props = {
  initialCategories: CategoryWithCount[];
  addonGroups: AddonGroup[];
};

export function MenuManager({ initialCategories, addonGroups }: Props) {
  const [categories, setCategories] = useState<CategoryWithCount[]>(initialCategories);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialCategories[0]?.id ?? null
  );

  const selectedCategory = categories.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-full gap-0">
      {/* Left pane — categories */}
      <aside className="w-56 shrink-0 overflow-y-auto border-r border-stone-200 bg-white p-3 md:w-64">
        <h3 className="mb-2 px-2 text-xs font-bold uppercase tracking-widest text-stone-400">
          Categories
        </h3>
        <CategoryList
          categories={categories}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChange={setCategories}
        />
      </aside>

      {/* Right pane — items */}
      <main className="flex flex-1 flex-col overflow-y-auto p-4">
        <ItemList
          categoryId={selectedId}
          categoryName={selectedCategory?.name ?? ""}
          addonGroups={addonGroups}
        />
      </main>
    </div>
  );
}
