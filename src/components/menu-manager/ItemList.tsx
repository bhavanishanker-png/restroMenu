"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { computeUnitPrice, formatMoney } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
import type { AddonGroup, MenuItem } from "@/types";
import { ItemEditorSheet } from "./ItemEditorSheet";
import { CategoryInsights } from "./CategoryInsights";
import { MsIcon } from "./MsIcon";

type Props = {
  categoryId: string | null;
  categoryName: string;
  addonGroups: AddonGroup[];
  /** Reports the loaded dish count so the category badges stay accurate. */
  onCountChange?: (categoryId: string, count: number) => void;
  onImport?: () => void;
};

type AvailabilityFilter = "all" | "available" | "unavailable";

const FILTERS: { value: AvailabilityFilter; label: string; icon: string }[] = [
  { value: "all", label: "All", icon: "restaurant_menu" },
  { value: "available", label: "Available", icon: "check_circle" },
  { value: "unavailable", label: "Unavailable", icon: "block" },
];

// ---------------------------------------------------------------- sortable row

function DishRow({
  item,
  sortable,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: MenuItem;
  /** False while a search/filter is active — reordering a subset is confusing. */
  sortable: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !sortable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const available = item.isAvailable;
  const switchId = `avail-${item.id}`;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-outline-variant p-2.5 shadow-level-1 transition-[border-color,box-shadow] duration-fast ease-out-quart hover:border-outline/40 hover:shadow-level-2 sm:flex-nowrap sm:p-3",
        available ? "bg-surface-container-lowest" : "bg-surface-container-low",
        isDragging && "relative z-10 shadow-level-3"
      )}
    >
      {sortable && (
        <button
          type="button"
          className="-mr-1 grid h-11 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-outline transition-colors hover:text-on-surface-variant active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${item.name}`}
        >
          <MsIcon name="drag_indicator" />
        </button>
      )}

      {/* Thumbnail + details open the editor — the whole row is the target. */}
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Edit ${item.name}`}
      >
        <div
          className={cn(
            "h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-container ring-1 ring-inset ring-outline-variant",
            !available && "opacity-60"
          )}
        >
          {item.imageUrl ? (
            // Plain <img>: Supabase storage URLs, rendered at 64px. Lazy and
            // async-decoded so a long category doesn't block first paint.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              width={64}
              height={64}
              loading="lazy"
              decoding="async"
              className={cn("h-full w-full object-cover", !available && "grayscale")}
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-outline" aria-hidden="true">
              <MsIcon name="add_photo_alternate" size={22} />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <FoodTypeMarker type={item.foodType} />
            <span
              className={cn(
                "truncate text-[0.9375rem] font-semibold",
                available ? "text-on-surface" : "text-on-surface-variant"
              )}
            >
              {item.name}
            </span>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface-variant">
            <span className="shrink-0 text-sm font-semibold tabular-nums text-on-surface">
              {formatMoney(item.basePrice)}
            </span>
            {item.variants.length > 0 && (
              <span className="flex min-w-0 items-center gap-1 truncate">
                <MsIcon name="straighten" size={14} />
                <span className="truncate">
                  {item.variants
                    .map((v) => `${v.name} ${formatMoney(computeUnitPrice(item.basePrice, v.priceDelta, []))}`)
                    .join(" · ")}
                </span>
              </span>
            )}
            {item.addonGroups.length > 0 && (
              <span className="flex shrink-0 items-center gap-1">
                <MsIcon name="add_circle" size={14} />
                {item.addonGroups.length} add-on {item.addonGroups.length === 1 ? "group" : "groups"}
              </span>
            )}
          </div>

          {item.description ? (
            <p className="line-clamp-1 text-xs text-on-surface-variant">{item.description}</p>
          ) : (
            <p className="flex items-center gap-1 text-xs italic text-on-surface-variant/80">
              No description yet
            </p>
          )}
        </div>
      </button>

      {/* Controls. On a phone they drop to their own row so nothing is
          squeezed below a 44px target. */}
      <div className="flex w-full shrink-0 items-center gap-1 border-t border-outline-variant pt-2 sm:w-auto sm:border-0 sm:pt-0">
        {/* Availability — the most-used control. Text + icon, never colour alone. */}
        <label
          htmlFor={switchId}
          className={cn(
            "mr-auto flex h-11 cursor-pointer items-center gap-2 rounded-full border pl-3 pr-1.5 text-xs font-semibold transition-colors sm:mr-1",
            available
              ? "border-success/30 bg-success-container text-on-success-container"
              : "border-outline-variant bg-surface-container-high text-on-surface-variant"
          )}
        >
          <MsIcon name={available ? "check_circle" : "block"} size={16} />
          <span className="w-[5.75rem]">{available ? "Available" : "Unavailable"}</span>
          <Switch
            id={switchId}
            checked={available}
            onCheckedChange={onToggle}
            aria-label={`${item.name} — ${available ? "mark unavailable" : "mark available"}`}
          />
        </label>

        <button
          type="button"
          onClick={onEdit}
          className="grid h-11 w-11 place-items-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          aria-label={`Edit ${item.name} details`}
        >
          <MsIcon name="edit" size={20} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="grid h-11 w-11 place-items-center rounded-xl text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container"
          aria-label={`Delete ${item.name}`}
        >
          <MsIcon name="delete" size={20} />
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- states

function EmptyCard({
  icon,
  title,
  body,
  children,
  tone = "neutral",
}: {
  icon: string;
  title: string;
  body: string;
  children?: ReactNode;
  tone?: "neutral" | "brand" | "error";
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-12 text-center">
      <span
        className={cn(
          "grid h-14 w-14 place-items-center rounded-2xl border",
          tone === "brand" && "border-brand-border bg-brand-subtle text-brand-text",
          tone === "error" && "border-error/25 bg-error-container text-on-error-container",
          tone === "neutral" && "border-outline-variant bg-surface-container text-on-surface-variant"
        )}
      >
        <MsIcon name={icon} size={26} />
      </span>
      <div className="space-y-1">
        <p className="font-display text-title text-on-surface">{title}</p>
        <p className="mx-auto max-w-sm text-body-sm text-on-surface-variant">{body}</p>
      </div>
      {children && <div className="flex flex-col gap-2 sm:flex-row">{children}</div>}
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="flex flex-col gap-2" aria-busy="true" aria-label="Loading dishes">
      {[1, 2, 3, 4, 5].map((n) => (
        <li
          key={n}
          className="flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-level-1"
        >
          <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3.5 w-1/4" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="hidden h-11 w-40 rounded-full sm:block" />
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- main component

export function ItemList({ categoryId, categoryName, addonGroups, onCountChange, onImport }: Props) {
  const [items, setItems] = useState<MenuItem[]>([]);
  // Start in the loading state when there is a category to fetch. Starting at
  // `false` meant the server-rendered HTML (and the first client frame) showed
  // "No dishes in Starters yet" until the fetch kicked in.
  const [loading, setLoading] = useState(categoryId !== null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AvailabilityFilter>("all");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Search and filter are per-category; switching category starts clean.
  useEffect(() => {
    setQuery("");
    setFilter("all");
  }, [categoryId]);

  // Fetch items when category changes.
  // Two fixes over the original: a non-2xx response used to be parsed as an
  // empty list (showing "Nothing in Starters yet" for a category with seven
  // dishes), and a slow response for a previous category could land after a
  // fast one and overwrite it.
  useEffect(() => {
    if (!categoryId) { setItems([]); return; }
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetch(`/api/menu/items?categoryId=${categoryId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { items?: MenuItem[] };
      })
      .then((data) => {
        if (cancelled) return;
        const loaded = data.items ?? [];
        setItems(loaded);
        onCountChange?.(categoryId, loaded.length);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("[menu] failed to load items", err);
        setItems([]);
        setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // `onCountChange` is a stable callback from the parent; refetching when
    // its identity changes would be wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, reloadKey]);

  function setItemsAndCount(next: MenuItem[]) {
    setItems(next);
    if (categoryId) onCountChange?.(categoryId, next.length);
  }

  async function handleToggle(item: MenuItem) {
    const prev = items;
    const next = !item.isAvailable;
    setItems((all) => all.map((i) => (i.id === item.id ? { ...i, isAvailable: next } : i)));

    try {
      const res = await fetch(`/api/menu/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAvailable: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error("[menu] availability update failed", err);
      setItems(prev);
      toast.error(`Couldn't update ${item.name}. It's still ${item.isAvailable ? "available" : "unavailable"}.`);
    }
  }

  async function handleDelete(item: MenuItem) {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    const prev = items;
    setItemsAndCount(items.filter((i) => i.id !== item.id));

    try {
      const res = await fetch(`/api/menu/items/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error("[menu] delete failed", err);
      setItemsAndCount(prev);
      toast.error("Failed to delete item.");
    }
  }

  function handleSaved(saved: MenuItem) {
    const idx = items.findIndex((i) => i.id === saved.id);
    setItemsAndCount(
      idx >= 0 ? items.map((i) => (i.id === saved.id ? saved : i)) : [...items, saved]
    );
    setEditingItem(null);
    setCreating(false);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const prev = items;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIdx, newIdx);
    setItems(reordered);

    // `fetch` doesn't reject on HTTP errors; the original only caught network
    // failures, so a rejected PATCH left an unsaved order on screen.
    try {
      const results = await Promise.all(
        reordered.map((item, idx) =>
          fetch(`/api/menu/items/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: idx }),
          })
        )
      );
      if (results.some((r) => !r.ok)) throw new Error("Some reorder requests failed");
    } catch (err) {
      console.error("[menu] reorder failed", err);
      setItems(prev);
      toast.error("Couldn't save the new order. Please try again.");
    }
  }

  const counts = useMemo(() => {
    const available = items.filter((i) => i.isAvailable).length;
    return { all: items.length, available, unavailable: items.length - available };
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === "available" && !i.isAvailable) return false;
      if (filter === "unavailable" && i.isAvailable) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, query, filter]);

  const filtering = query.trim() !== "" || filter !== "all";

  if (!categoryId) {
    return (
      <div className="flex flex-1 items-center justify-center p-5">
        <EmptyCard
          icon="restaurant_menu"
          title="No category selected"
          body="Pick a category to manage its dishes."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-display text-headline-sm text-on-surface">{categoryName}</h2>
              <p className="text-body-sm tabular-nums text-on-surface-variant">
                {loading
                  ? "Loading dishes…"
                  : loadError
                    ? "Couldn't load dishes"
                    : `${counts.all} ${counts.all === 1 ? "dish" : "dishes"}${counts.unavailable > 0 ? ` · ${counts.unavailable} unavailable` : ""}`}
              </p>
            </div>
            <Button variant="brand" size="touch" className="shrink-0 px-4" onClick={() => setCreating(true)}>
              <MsIcon name="add" size={20} /> Add dish
            </Button>
          </div>

          {/* Toolbar — only once there's something to search. */}
          {!loading && !loadError && items.length > 0 && (
            <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-level-1 md:flex-row md:items-center">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${categoryName}`}
                  aria-label={`Search dishes in ${categoryName}`}
                  className="h-11 pl-9 pr-11 [&::-webkit-search-cancel-button]:hidden"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              <div
                role="radiogroup"
                aria-label="Filter by availability"
                className="grid grid-cols-[auto_1fr_1fr] gap-1.5 md:flex"
              >
                {FILTERS.map((f) => {
                  const active = filter === f.value;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setFilter(f.value)}
                      className={cn(
                        "flex h-11 min-w-0 shrink-0 items-center justify-center gap-1 rounded-full border px-3 text-[13px] font-medium sm:gap-1.5 sm:text-sm transition-colors duration-fast sm:px-3.5",
                        active
                          ? "border-brand bg-brand text-brand-foreground shadow-glow"
                          : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-outline hover:text-on-surface"
                      )}
                    >
                      {/* Wrapper, not a class on the glyph: the icon font's own
                          display rule would win over `hidden`. */}
                      <span className="hidden sm:contents"><MsIcon name={f.icon} size={16} /></span>
                      <span className="truncate">{f.label}</span>
                      <span className="tabular-nums opacity-80">{counts[f.value]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* List */}
          {loading ? (
            <ListSkeleton />
          ) : loadError ? (
            <EmptyCard
              icon="cloud_off"
              tone="error"
              title={`Couldn't load ${categoryName}`}
              body="Your dishes are safe — we just couldn't fetch them. Check your connection and retry."
            >
              <Button variant="brand" size="touch" onClick={() => setReloadKey((k) => k + 1)}>
                <MsIcon name="refresh" /> Retry
              </Button>
            </EmptyCard>
          ) : items.length === 0 ? (
            <EmptyCard
              icon="restaurant"
              tone="brand"
              title={`No dishes in ${categoryName} yet`}
              body="Add a dish and it appears on the live menu immediately."
            >
              <Button variant="brand" size="touch" onClick={() => setCreating(true)}>
                <MsIcon name="add" /> Add first dish
              </Button>
              {onImport && (
                <Button variant="outline" size="touch" onClick={onImport}>
                  <MsIcon name="auto_awesome" className="text-brand-text" /> Import with AI
                </Button>
              )}
            </EmptyCard>
          ) : visible.length === 0 ? (
            <EmptyCard
              icon="search_off"
              title={query.trim() ? `No dishes match “${query.trim()}”` : "No dishes in this view"}
              body={
                filter === "unavailable"
                  ? "Everything here is available right now."
                  : "Try a different word, or clear the search and filter."
              }
            >
              <Button
                variant="outline"
                size="touch"
                onClick={() => { setQuery(""); setFilter("all"); }}
              >
                <MsIcon name="filter_alt_off" /> Clear search &amp; filter
              </Button>
            </EmptyCard>
          ) : (
            <>
              {filtering && (
                <p className="-mt-1 px-1 text-xs text-on-surface-variant">
                  Showing {visible.length} of {items.length}. Clear the search and filter to reorder.
                </p>
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={visible.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <ul className="flex flex-col gap-2">
                    {visible.map((item) => (
                      <DishRow
                        key={item.id}
                        item={item}
                        sortable={!filtering}
                        onToggle={() => handleToggle(item)}
                        onEdit={() => setEditingItem(item)}
                        onDelete={() => handleDelete(item)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            </>
          )}
        </div>
      </div>

      {/* Right rail — stats + live guest preview. Only from 2xl up, where
          there is genuinely spare width to fill. */}
      {!loading && <CategoryInsights items={items} categoryName={categoryName} />}

      {/* Editor sheet */}
      <ItemEditorSheet
        open={creating || editingItem !== null}
        item={editingItem}
        categoryId={categoryId}
        categoryName={categoryName}
        addonGroups={addonGroups}
        onClose={() => { setEditingItem(null); setCreating(false); }}
        onSaved={handleSaved}
      />
    </div>
  );
}
