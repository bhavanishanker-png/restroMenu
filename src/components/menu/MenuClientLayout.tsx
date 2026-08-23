"use client";

import { useEffect, useMemo, useState } from "react";
import { CategoryTabs } from "./CategoryTabs";
import { CartBar } from "./CartBar";
import { ItemDetailSheet } from "./ItemDetailSheet";
import { MenuFilters } from "./MenuFilters";
import { MenuHeader } from "./MenuHeader";
import { MenuSection } from "./MenuSection";
import { useCartStore } from "@/store/cart";
import type { MenuItem, PublicMenu } from "@/types";

type Props = { menu: PublicMenu; token: string };

export default function MenuClientLayout({ menu, token }: Props) {
  const [search, setSearch] = useState("");
  const [vegOnly, setVegOnly] = useState(false);
  const [bestsellersOnly, setBestsellersOnly] = useState(false);
  const [under200, setUnder200] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  const init = useCartStore((s) => s.init);
  const slug = menu.restaurant.slug;

  // Hydrate cart from localStorage and bind to this table
  useEffect(() => {
    useCartStore.persist.rehydrate();
    if (menu.table) {
      init(slug, menu.table.id);
    }
  }, [slug, menu.table, init]);

  const isFiltering = Boolean(search || vegOnly || bestsellersOnly || under200);

  const filteredCategories = useMemo(() => {
    return menu.categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => {
          if (vegOnly && item.foodType !== "veg") return false;
          if (bestsellersOnly && !item.tags.includes("bestseller")) return false;
          if (under200 && item.basePrice >= 200) return false;
          if (search) {
            const q = search.toLowerCase();
            return (
              item.name.toLowerCase().includes(q) ||
              (item.description?.toLowerCase().includes(q) ?? false)
            );
          }
          return true;
        }),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [menu.categories, search, vegOnly, bestsellersOnly, under200]);

  return (
    <div className="min-h-screen bg-background">
      <MenuHeader restaurant={menu.restaurant} table={menu.table} />

      {/* Sticky filter + tabs bar */}
      <div className="sticky top-0 z-20 border-b border-outline-variant/50 bg-surface/90 backdrop-blur-md">
        <MenuFilters
          search={search}
          onSearchChange={setSearch}
          vegOnly={vegOnly}
          onVegOnlyChange={setVegOnly}
          bestsellersOnly={bestsellersOnly}
          onBestsellersOnlyChange={setBestsellersOnly}
          under200={under200}
          onUnder200Change={setUnder200}
        />
        <CategoryTabs categories={filteredCategories} />
      </div>

      {/* Menu content */}
      <main className="pb-28">
        {filteredCategories.length === 0 && isFiltering ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <p className="font-body-md text-on-surface-variant">
              {search
                ? `Nothing matches "${search}"`
                : "No items match the active filters"}
            </p>
            <button
              onClick={() => {
                setSearch("");
                setVegOnly(false);
                setBestsellersOnly(false);
                setUnder200(false);
              }}
              className="font-label-bold text-label-bold text-primary underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          filteredCategories.map((cat) => (
            <MenuSection
              key={cat.id}
              category={cat}
              onAddItem={setSelectedItem}
            />
          ))
        )}
      </main>

      {/* Item detail sheet */}
      <ItemDetailSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      {/* Floating cart bar */}
      <CartBar slug={slug} token={token} />
    </div>
  );
}
