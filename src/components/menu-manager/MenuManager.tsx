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
      <aside className="hidden lg:flex w-[280px] shrink-0 flex-col border-r border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
        <div className="flex items-center justify-between px-md py-sm border-b border-outline-variant/30 bg-surface-container-low">
          <h2 className="font-headline-sm text-on-surface" style={{ fontSize: 15 }}>Categories</h2>
          <button className="flex h-8 w-8 items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <CategoryList
            categories={categories}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={setCategories}
          />
        </div>
      </aside>

      {/* Right pane — items */}
      <main className="flex flex-1 flex-col overflow-hidden bg-surface">
        <ItemList
          categoryId={selectedId}
          categoryName={selectedCategory?.name ?? ""}
          addonGroups={addonGroups}
        />
      </main>
    </div>
  );
}
