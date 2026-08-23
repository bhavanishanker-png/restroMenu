"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

  const [navMounted, setNavMounted] = useState(false);

  const init = useCartStore((s) => s.init);
  const lines = useCartStore((s) => s.lines);
  const slug = menu.restaurant.slug;

  useEffect(() => {
    useCartStore.persist.rehydrate();
    if (menu.table) {
      init(slug, menu.table.id);
    }
    setNavMounted(true);
  }, [slug, menu.table, init]);

  // Only read cart count after mount so server render matches (both show 0 badge)
  const cartCount = navMounted ? lines.reduce((sum, l) => sum + l.quantity, 0) : 0;

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
      {/* Fixed top bar */}
      <MenuHeader restaurant={menu.restaurant} table={menu.table} />

      {/* Sticky filter + tabs bar — top-[64px] to sit below fixed header */}
      <div className="sticky top-[64px] z-20 border-b border-outline-variant/40 bg-surface/90 backdrop-blur-md">
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

      {/* Menu content — pt-[64px] for fixed header, pb-48 for bottom nav + cart bar */}
      <main className="pt-[64px] pb-48">
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

      {/* Floating cart bar — sits above bottom nav */}
      <CartBar slug={slug} token={token} />

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-[72px] items-center justify-around rounded-t-2xl bg-surface-container-lowest border-t border-outline-variant/30 px-2 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <BottomNavItem icon="restaurant_menu" label="Menu" active />
        <Link
          href={`/r/${slug}/t/${token}/cart`}
          className="relative flex flex-col items-center gap-1 rounded-2xl px-5 py-2 transition-colors hover:bg-surface-container-high"
          aria-label="Cart"
        >
          <span
            className="material-symbols-outlined text-on-surface-variant"
            style={{ fontSize: 24 }}
          >
            shopping_bag
          </span>
          <span className="font-label-bold text-on-surface-variant" style={{ fontSize: 11 }}>
            Cart
          </span>
          {cartCount > 0 && (
            <span className="absolute top-1.5 right-3.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-on-primary font-label-bold" style={{ fontSize: 9 }}>
              {cartCount > 9 ? "9+" : cartCount}
            </span>
          )}
        </Link>
        <BottomNavItem icon="room_service" label="Requests" active={false} disabled />
      </nav>
    </div>
  );
}

function BottomNavItem({
  icon,
  label,
  active,
  disabled,
}: {
  icon: string;
  label: string;
  active: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-2xl px-5 py-2 transition-colors ${
        active ? "bg-primary-container" : disabled ? "opacity-40" : "hover:bg-surface-container-high"
      }`}
      aria-current={active ? "page" : undefined}
    >
      <span
        className={`material-symbols-outlined ${active ? "text-on-primary-container" : "text-on-surface-variant"}`}
        style={{ fontSize: 24, fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
      >
        {icon}
      </span>
      <span
        className={`font-label-bold ${active ? "text-on-primary-container" : "text-on-surface-variant"}`}
        style={{ fontSize: 11 }}
      >
        {label}
      </span>
    </div>
  );
}
