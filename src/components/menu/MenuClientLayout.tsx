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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCartStore } from "@/store/cart";
import { cn } from "@/lib/utils";
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
  const inGroupSession = navMounted && Boolean(sessionId);

  function clearFilters() {
    setSearch("");
    setVegOnly(false);
    setBestsellersOnly(false);
    setUnder200(false);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed top bar */}
      <MenuHeader restaurant={menu.restaurant} table={menu.table} />

      {/* Group order banner — shown when in a session */}
      {inGroupSession && joinCode && (
        <button
          type="button"
          onClick={() => setGroupSheetOpen(true)}
          className="glass sticky top-[64px] z-[25] flex w-full items-center justify-between gap-3 border-x-0 border-t-0 px-margin-mobile py-2 text-left transition-colors hover:bg-surface-container-high/70"
        >
          <span className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-brand-text"
              style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              group
            </span>
            <span className="text-[0.8125rem] font-semibold text-on-surface">
              Group order · {personName}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span className="font-mono text-sm font-bold tracking-widest text-brand-text">
              {joinCode}
            </span>
            <span
              className="material-symbols-outlined text-on-surface-variant"
              style={{ fontSize: 16 }}
              aria-hidden="true"
            >
              chevron_right
            </span>
          </span>
        </button>
      )}

      {/* Sticky filter + tabs bar — shown only on menu tab */}
      {isMenuTab && (
        <div
          className="glass sticky z-20 border-x-0 border-t-0"
          style={{ top: inGroupSession ? "100px" : "64px" }}
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
        <main className="pb-48 pt-[64px]">
          {filteredCategories.length === 0 && isFiltering ? (
            <div className="flex flex-col items-center gap-4 px-margin-mobile py-xl text-center">
              <div
                className="grid h-14 w-14 place-items-center rounded-full border border-outline-variant bg-surface-container"
                aria-hidden="true"
              >
                <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 26 }}>
                  search_off
                </span>
              </div>
              <div className="space-y-1">
                <p className="font-display text-headline-sm text-on-surface">
                  {search ? `Nothing matches “${search}”` : "No dishes match those filters"}
                </p>
                <p className="measure-sm text-body-sm text-on-surface-variant">
                  Try removing a filter, or search for something else on the menu.
                </p>
              </div>
              <button
                onClick={clearFilters}
                className="min-h-[44px] rounded-lg border border-outline-variant px-5 font-label-bold text-label-bold uppercase text-on-surface transition-colors hover:border-brand/50 hover:text-brand-text"
              >
                Clear filters
              </button>
            </div>
          ) : (
            filteredCategories.map((cat) => (
              <MenuSection key={cat.id} category={cat} onAddItem={setSelectedItem} />
            ))
          )}
        </main>
      ) : (
        <div className="pb-28 pt-[64px]">
          <ServiceRequestPanel slug={slug} token={token} />
        </div>
      )}

      {/* Item detail sheet */}
      <ItemDetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} />

      {/* Floating cart bar — sits above bottom nav, only on menu tab */}
      {isMenuTab && <CartBar slug={slug} token={token} />}

      {/* Bottom navigation */}
      <nav
        aria-label="Primary"
        className="glass-strong fixed inset-x-0 bottom-0 z-30 flex h-[72px] items-center justify-around rounded-t-2xl border-x-0 border-b-0 px-2 pb-[env(safe-area-inset-bottom)]"
      >
        <BottomNavItem
          icon="restaurant_menu"
          label="Menu"
          active={activeTab === "menu"}
          onClick={() => setActiveTab("menu")}
        />

        <Link
          href={`/r/${slug}/t/${token}/cart`}
          className="relative flex min-h-[44px] flex-col items-center gap-1 rounded-xl px-5 py-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          aria-label={cartCount > 0 ? `Cart, ${cartCount} items` : "Cart"}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 24 }} aria-hidden="true">
            shopping_bag
          </span>
          <span className="text-[11px] font-semibold">Cart</span>
          {cartCount > 0 && (
            <span className="tabular absolute right-3.5 top-1.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-brand-foreground">
              {cartCount > 9 ? "9+" : cartCount}
            </span>
          )}
        </Link>

        {/* Group order */}
        <button
          onClick={() => setGroupSheetOpen(true)}
          className={cn(
            "relative flex min-h-[44px] flex-col items-center gap-1 rounded-xl px-5 py-2 transition-colors hover:bg-surface-container-high",
            // Was `text-secondary`, which resolves to a *surface* token — the
            // label was rendering near-invisible in both themes. The active
            // group state is an accent state, so it uses the accent token.
            inGroupSession ? "text-brand-text" : "text-on-surface-variant hover:text-on-surface"
          )}
          aria-label="Group order"
          aria-pressed={inGroupSession}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 24, fontVariationSettings: inGroupSession ? "'FILL' 1" : "'FILL' 0" }}
            aria-hidden="true"
          >
            group
          </span>
          <span className="text-[11px] font-semibold">Group</span>
          {inGroupSession && (
            <span className="absolute right-3 top-1.5 h-2 w-2 rounded-full bg-brand" />
          )}
        </button>

        <BottomNavItem
          icon="room_service"
          label="Requests"
          active={activeTab === "requests"}
          onClick={() => setActiveTab("requests")}
        />
      </nav>

      {/* Group order bottom sheet.
          Was a hand-rolled fixed-position div with a click-to-close backdrop —
          no focus trap, no Escape handling, no scroll lock, and invisible to
          assistive tech. Radix's Sheet gives all of that for free. */}
      <Sheet open={groupSheetOpen} onOpenChange={setGroupSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-0">
          <SheetHeader className="sticky top-0 z-10 border-b border-outline-variant bg-surface-container-lowest px-6 pb-3 pt-5 text-left">
            <SheetTitle className="font-display text-headline-sm">Group order</SheetTitle>
            <SheetDescription className="text-body-sm">
              Share the code so everyone at the table can add to one bill.
            </SheetDescription>
          </SheetHeader>
          <GroupOrderSheet
            slug={slug}
            token={token}
            onClose={() => setGroupSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>
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
      className={cn(
        "relative flex min-h-[44px] flex-col items-center gap-1 rounded-xl px-5 py-2 transition-colors",
        active
          ? "text-on-surface"
          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
      )}
      aria-current={active ? "page" : undefined}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 24, fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="text-[11px] font-semibold">{label}</span>
      {/* An underline bar, so the selected tab is not signalled by colour alone. */}
      {active && (
        <span className="absolute inset-x-4 bottom-0.5 h-0.5 rounded-full bg-brand" />
      )}
    </button>
  );
}
