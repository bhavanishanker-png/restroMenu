"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CategoryTabs } from "./CategoryTabs";
import { CartBar } from "./CartBar";
import { ItemDetailSheet } from "./ItemDetailSheet";
import { MenuFilters } from "./MenuFilters";
import { MenuHeader } from "./MenuHeader";
import { MenuSection } from "./MenuSection";
import { ServiceRequestPanel } from "./ServiceRequestPanel";
import { GroupOrderSheet } from "./GroupOrderSheet";
import { useCartStore } from "@/store/cart";
import type { MenuItem, PublicMenu } from "@/types";

type ActiveTab = "menu" | "cart" | "requests";

type Props = { menu: PublicMenu; token: string };

export default function MenuClientLayout({ menu, token }: Props) {
  const [search, setSearch] = useState("");
  const [vegOnly, setVegOnly] = useState(false);
  const [bestsellersOnly, setBestsellersOnly] = useState(false);
  const [under200, setUnder200] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("menu");
  const [groupSheetOpen, setGroupSheetOpen] = useState(false);

  const [navMounted, setNavMounted] = useState(false);

  const init = useCartStore((s) => s.init);
  const lines = useCartStore((s) => s.lines);
  const sessionId = useCartStore((s) => s.sessionId);
  const joinCode = useCartStore((s) => s.joinCode);
  const personName = useCartStore((s) => s.personName);
  const slug = menu.restaurant.slug;

  useEffect(() => {
    useCartStore.persist.rehydrate();
    if (menu.table) {
      init(slug, menu.table.id);
    }
    setNavMounted(true);
  }, [slug, menu.table, init]);

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

  const isMenuTab = activeTab === "menu";

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed top bar */}
      <MenuHeader restaurant={menu.restaurant} table={menu.table} />

      {/* Group order banner — shown when in a session */}
      {navMounted && sessionId && joinCode && (
        <div
          className="sticky top-[64px] z-[25] flex items-center justify-between gap-3 bg-secondary-container/90 backdrop-blur-sm px-4 py-2 border-b border-secondary/20 cursor-pointer"
          onClick={() => setGroupSheetOpen(true)}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-on-secondary-container" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>
              group
            </span>
            <span className="font-label-bold text-on-secondary-container" style={{ fontSize: 13 }}>
              Group order · {personName}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono font-bold text-on-secondary-container tracking-widest" style={{ fontSize: 14 }}>
              {joinCode}
            </span>
            <span className="material-symbols-outlined text-on-secondary-container/70" style={{ fontSize: 16 }}>
              chevron_right
            </span>
          </div>
        </div>
      )}

      {/* Sticky filter + tabs bar — shown only on menu tab */}
      {isMenuTab && (
        <div
          className="sticky z-20 border-b border-outline-variant/40 bg-surface/90 backdrop-blur-md"
          style={{ top: navMounted && sessionId ? "100px" : "64px" }}
        >
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
      )}

      {/* Page content */}
      {isMenuTab ? (
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
      ) : (
        <div className="pt-[64px] pb-28">
          <ServiceRequestPanel slug={slug} token={token} />
        </div>
      )}

      {/* Item detail sheet */}
      <ItemDetailSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      {/* Floating cart bar — sits above bottom nav, only on menu tab */}
      {isMenuTab && <CartBar slug={slug} token={token} />}

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-[72px] items-center justify-around rounded-t-2xl bg-surface-container-lowest border-t border-outline-variant/30 px-2 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <BottomNavItem
          icon="restaurant_menu"
          label="Menu"
          active={activeTab === "menu"}
          onClick={() => setActiveTab("menu")}
        />
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

        {/* Group order button */}
        <button
          onClick={() => setGroupSheetOpen(true)}
          className={`relative flex flex-col items-center gap-1 rounded-2xl px-5 py-2 transition-colors hover:bg-surface-container-high ${
            sessionId ? "text-secondary" : "text-on-surface-variant"
          }`}
          aria-label="Group order"
        >
          <span
            className={`material-symbols-outlined ${sessionId ? "text-secondary" : "text-on-surface-variant"}`}
            style={{ fontSize: 24, fontVariationSettings: sessionId ? "'FILL' 1" : "'FILL' 0" }}
          >
            group
          </span>
          <span className={`font-label-bold ${sessionId ? "text-secondary" : "text-on-surface-variant"}`} style={{ fontSize: 11 }}>
            Group
          </span>
          {sessionId && (
            <span className="absolute top-1.5 right-3 h-2 w-2 rounded-full bg-secondary" />
          )}
        </button>

        <BottomNavItem
          icon="room_service"
          label="Requests"
          active={activeTab === "requests"}
          onClick={() => setActiveTab("requests")}
        />
      </nav>

      {/* Group order bottom sheet */}
      {groupSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setGroupSheetOpen(false)}
          />
          <div className="relative w-full rounded-t-3xl bg-surface max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 flex justify-between items-center px-6 pt-4 pb-2 bg-surface border-b border-outline-variant/20">
              <p className="font-headline-sm text-on-surface" style={{ fontSize: 17 }}>Group Order</p>
              <button
                onClick={() => setGroupSheetOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            <GroupOrderSheet
              slug={slug}
              token={token}
              onClose={() => setGroupSheetOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function BottomNavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-2xl px-5 py-2 transition-colors ${
        active ? "bg-primary-container" : "hover:bg-surface-container-high"
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
    </button>
  );
}
