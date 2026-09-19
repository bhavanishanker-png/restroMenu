"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
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
      {/*
        `flex-1 min-w-0` is load-bearing. This element is a flex *item* of the
        page wrapper, and without it the default `flex: 0 1 auto` sized it to
        its content — a 280px sidebar plus a content-width item list — which is
        why roughly half the page was empty regardless of how wide the window
        got. `min-w-0` then lets the item pane actually shrink instead of being
        forced wide by its own content.
      */}
      <div className="flex h-full min-w-0 flex-1">
        {/* Left pane — categories */}
        <aside className="hidden w-[280px] shrink-0 flex-col overflow-hidden border-r border-outline-variant bg-surface-container-lowest lg:flex">
          <div className="flex items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-low px-4 py-3">
            <h2 className="font-display text-title text-on-surface">Categories</h2>
            <button
              onClick={() => setExtractOpen(true)}
              title="Import a menu from a photo or PDF"
              className="flex items-center gap-1.5 rounded-full border border-brand-border bg-brand-subtle px-2.5 py-1 font-label-bold text-label-bold uppercase text-brand-text transition-colors hover:bg-brand hover:text-brand-foreground"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              AI import
            </button>
            {/*
              A second "+" button used to sit here with no onClick at all.
              CategoryList already renders a working "Add category" control at
              the bottom of the list, so the dead one is gone rather than
              duplicated.
            */}
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
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface">
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
