"use client";

import { useCallback, useState } from "react";
import type { AddonGroup, MenuCategory } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { CategoryList } from "./CategoryList";
import { ItemList } from "./ItemList";
import { MenuExtractDialog } from "./MenuExtractDialog";
import { MsIcon } from "./MsIcon";

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
  const [manageOpen, setManageOpen] = useState(false);
  // When the manage sheet is opened from the "no categories" CTA, it should
  // open straight into the add-category input.
  const [manageStartsAdding, setManageStartsAdding] = useState(false);

  // Fall back to the first category when the selected one is deleted. Before,
  // deleting the selected category left the item pane showing a category that
  // no longer existed, with a blank heading.
  const selectedCategory =
    categories.find((c) => c.id === selectedId) ?? categories[0] ?? null;
  const activeId = selectedCategory?.id ?? null;

  // The item list is the source of truth for how many dishes a category has
  // once it has loaded them — keeps the badges right after add/delete without
  // a page reload.
  const handleCountChange = useCallback((categoryId: string, count: number) => {
    setCategories((prev) =>
      prev.some((c) => c.id === categoryId && c.itemCount !== count)
        ? prev.map((c) => (c.id === categoryId ? { ...c, itemCount: count } : c))
        : prev
    );
  }, []);

  const totalDishes = categories.reduce((n, c) => n + c.itemCount, 0);

  function openManage(startAdding: boolean) {
    setManageStartsAdding(startAdding);
    setManageOpen(true);
  }

  function handleCategoriesChange(next: CategoryWithCount[]) {
    // A freshly created category becomes the selection, so the owner can
    // start adding dishes to it right away.
    const created = next.find((c) => !categories.some((p) => p.id === c.id));
    setCategories(next);
    if (created) setSelectedId(created.id);
  }

  return (
    <>
      {/*
        `flex-1 min-w-0` is load-bearing. This element is a flex *item* of the
        page wrapper, and without it the default `flex: 0 1 auto` sized it to
        its content. `min-w-0` lets the item pane shrink instead of being
        forced wide by its own content.
      */}
      <div className="flex h-full min-w-0 flex-1">
        {/* ── Left pane: categories (lg+) ───────────────────────────── */}
        <aside
          aria-label="Menu categories"
          className="hidden w-[296px] shrink-0 flex-col overflow-hidden border-r border-outline-variant bg-surface-container-lowest lg:flex"
        >
          <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
            <div>
              <h2 className="font-display text-title text-on-surface">Categories</h2>
              <p className="text-xs tabular-nums text-on-surface-variant">
                {categories.length} {categories.length === 1 ? "category" : "categories"} ·{" "}
                {totalDishes} {totalDishes === 1 ? "dish" : "dishes"}
              </p>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            <CategoryList
              categories={categories}
              selectedId={activeId}
              onSelect={setSelectedId}
              onChange={handleCategoriesChange}
            />
          </div>
          <div className="shrink-0 border-t border-outline-variant p-3">
            <AiImportCard onClick={() => setExtractOpen(true)} />
          </div>
        </aside>

        {/* ── Right pane: dishes ───────────────────────────────────── */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface">
          {categories.length > 0 && (
            <MobileCategoryBar
              categories={categories}
              activeId={activeId}
              onSelect={setSelectedId}
              onManage={() => openManage(false)}
              onImport={() => setExtractOpen(true)}
            />
          )}

          {categories.length === 0 ? (
            <NoCategories
              onAdd={() => openManage(true)}
              onImport={() => setExtractOpen(true)}
            />
          ) : (
            <ItemList
              categoryId={activeId}
              categoryName={selectedCategory?.name ?? ""}
              addonGroups={addonGroups}
              onCountChange={handleCountChange}
              onImport={() => setExtractOpen(true)}
            />
          )}
        </main>
      </div>

      {/* Category management on small screens, and the "add first category"
          flow at every width. */}
      <Sheet open={manageOpen} onOpenChange={setManageOpen}>
        <SheetContent side="left" className="flex w-[88vw] max-w-sm flex-col gap-0 p-0">
          <SheetHeader className="border-b border-outline-variant bg-surface-container-low px-5 pb-4 pt-5 text-left">
            <SheetTitle className="font-display">Categories</SheetTitle>
            <SheetDescription>
              Tap to open, drag the handle to reorder, or rename and delete.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <CategoryList
              key={manageStartsAdding ? "adding" : "browsing"}
              categories={categories}
              selectedId={activeId}
              onSelect={(id) => {
                setSelectedId(id);
                setManageOpen(false);
              }}
              onChange={(next) => {
                const grew = next.length > categories.length;
                handleCategoriesChange(next);
                if (grew && manageStartsAdding) setManageOpen(false);
              }}
              defaultAdding={manageStartsAdding}
            />
          </div>
          <div className="shrink-0 border-t border-outline-variant p-3">
            <AiImportCard
              onClick={() => {
                setManageOpen(false);
                setExtractOpen(true);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

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

// ---------------------------------------------------------------- pieces

function AiImportCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-2xl border border-brand-border bg-brand-subtle p-3 text-left transition-[box-shadow,transform] duration-fast hover:shadow-glow active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-brand-foreground shadow-level-1">
        <MsIcon name="auto_awesome" size={22} filled />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-on-surface">Import with AI</span>
        <span className="block text-xs text-on-surface-variant">
          Photo or PDF of a printed menu
        </span>
      </span>
      <MsIcon
        name="arrow_forward"
        className="text-brand-text transition-transform duration-fast group-hover:translate-x-0.5"
      />
    </button>
  );
}

/** Category switcher below lg, where the sidebar is hidden. One-tap chips. */
function MobileCategoryBar({
  categories,
  activeId,
  onSelect,
  onManage,
  onImport,
}: {
  categories: CategoryWithCount[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onManage: () => void;
  onImport: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-outline-variant bg-surface-container-lowest lg:hidden">
      <div className="flex items-center gap-2 px-4 pt-3 sm:px-5">
        <p className="flex-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
          Categories
        </p>
        <Button variant="ghost" size="sm" className="h-11 px-3" onClick={onImport}>
          <MsIcon name="auto_awesome" className="text-brand-text" /> AI import
        </Button>
        <Button variant="outline" size="sm" className="h-11 px-3" onClick={onManage}>
          <MsIcon name="tune" /> Manage
        </Button>
      </div>
      <div
        role="radiogroup"
        aria-label="Choose a category"
        className="flex gap-1.5 overflow-x-auto px-4 pb-3 pt-2 sm:px-5"
      >
        {categories.map((c) => {
          const active = c.id === activeId;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(c.id)}
              className={cn(
                "flex h-11 shrink-0 items-center gap-2 rounded-full border pl-4 pr-2 text-sm font-medium transition-colors duration-fast",
                active
                  ? "border-brand bg-brand text-brand-foreground shadow-glow"
                  : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-outline hover:text-on-surface"
              )}
            >
              <span className="whitespace-nowrap">{c.name}</span>
              <span
                className={cn(
                  "grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-semibold tabular-nums",
                  active ? "bg-brand-foreground/20" : "bg-surface-container-high text-on-surface"
                )}
              >
                {c.itemCount}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NoCategories({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-5">
      <div className="flex w-full max-w-lg flex-col items-center gap-5 rounded-2xl border border-outline-variant bg-surface-container-lowest px-6 py-10 text-center shadow-level-1">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-brand-border bg-brand-subtle text-brand-text">
          <MsIcon name="restaurant_menu" size={28} />
        </span>
        <div className="space-y-1.5">
          <h2 className="font-display text-headline-sm text-on-surface">Build your menu</h2>
          <p className="text-body-sm text-on-surface-variant">
            Start with a category like &ldquo;Starters&rdquo; or &ldquo;Mains&rdquo;, or let
            AI read your printed menu and draft every dish for you to review.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button variant="brand" size="touch" onClick={onImport}>
            <MsIcon name="auto_awesome" filled /> Import with AI
          </Button>
          <Button variant="outline" size="touch" onClick={onAdd}>
            <MsIcon name="add" /> Add a category
          </Button>
        </div>
      </div>
    </div>
  );
}
