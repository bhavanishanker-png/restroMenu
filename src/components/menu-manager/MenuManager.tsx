"use client";

import { useState } from "react";
import type { AddonGroup, MenuCategory } from "@/types";
import { CategoryList } from "./CategoryList";
import { ItemList } from "./ItemList";
import { MenuExtractDialog } from "./MenuExtractDialog";

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
  const [extractOpen, setExtractOpen] = useState(false);

  const selectedCategory = categories.find((c) => c.id === selectedId) ?? null;

  return (
    <>
    <div className="flex h-full gap-0">
      {/* Left pane — categories */}
      <aside className="hidden lg:flex w-[280px] shrink-0 flex-col border-r border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
        <div className="flex items-center justify-between px-md py-sm border-b border-outline-variant/30 bg-surface-container-low">
          <h2 className="font-headline-sm text-on-surface" style={{ fontSize: 15 }}>Categories</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExtractOpen(true)}
              title="Import menu from photo or PDF using AI"
              className="flex items-center gap-1 rounded-full bg-primary-container text-on-primary-container px-2.5 py-1 hover:bg-primary-container/80 transition-colors"
              style={{ fontSize: 11 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14, fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              <span className="font-label-bold hidden sm:inline">AI Import</span>
            </button>
            <button className="flex h-8 w-8 items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
            </button>
          </div>
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

    <MenuExtractDialog
      open={extractOpen}
      onClose={() => setExtractOpen(false)}
      onImported={() => {
        setExtractOpen(false);
        window.location.reload();
      }}
    />
    </>
  );
}
