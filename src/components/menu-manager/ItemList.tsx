"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2, Plus, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/pricing";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
import type { AddonGroup, MenuItem } from "@/types";
import { ItemEditorSheet } from "./ItemEditorSheet";
import { CategoryInsights } from "./CategoryInsights";

type Props = {
  categoryId: string | null;
  categoryName: string;
  addonGroups: AddonGroup[];
};

// ---------------------------------------------------------------- sortable row

function ItemRow({
  item,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: MenuItem;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2.5 shadow-level-1 transition-[border-color,box-shadow] duration-fast ease-out-quart hover:border-outline/40 hover:shadow-level-2"
    >
      {/* Drag handle */}
      <button
        className="cursor-grab touch-none rounded p-1 text-outline transition-colors hover:text-on-surface-variant"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${item.name}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Thumbnail */}
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-container ring-1 ring-inset ring-outline-variant">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className={`h-full w-full object-cover ${item.isAvailable ? "" : "grayscale"}`}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-outline" aria-hidden="true">
            <ImageOff className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <FoodTypeMarker type={item.foodType} />
          <span
            className={`truncate text-sm font-medium ${
              item.isAvailable ? "text-on-surface" : "text-on-surface-variant line-through"
            }`}
          >
            {item.name}
          </span>
          {!item.isAvailable && (
            <span className="shrink-0 rounded-full border border-outline-variant bg-surface-container px-1.5 py-0.5 font-label-bold text-label-bold uppercase text-on-surface-variant">
              Off menu
            </span>
          )}
        </div>
        {/* `min-w-0` + `truncate` on the description alone: the price and
            variant count must never wrap, only the description clips. */}
        <div className="flex min-w-0 items-center gap-2 text-xs text-on-surface-variant">
          <span className="tabular shrink-0 font-semibold text-on-surface">
            {formatMoney(item.basePrice)}
          </span>
          {item.variants.length > 0 && (
            <span className="shrink-0 whitespace-nowrap">
              · {item.variants.length} variants
            </span>
          )}
          {item.description ? (
            <span className="truncate">· {item.description}</span>
          ) : (
            <span className="shrink-0 italic">· no description</span>
          )}
        </div>
      </div>

      {/* Availability toggle — the most-used control */}
      <Switch
        checked={item.isAvailable}
        onCheckedChange={onToggle}
        aria-label={`${item.name} — ${item.isAvailable ? "mark unavailable" : "mark available"}`}
      />

      {/*
        Actions were `opacity-0 group-hover:opacity-100`, which hid them from
        keyboard users entirely: Tab moved focus onto a fully transparent
        button with no visible focus ring. They now also appear on focus, and
        stay visible on touch where hover never fires.
      */}
      <div className="flex gap-1 opacity-100 transition-opacity duration-fast md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <button
          onClick={onEdit}
          className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          aria-label={`Edit ${item.name}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container"
          aria-label={`Delete ${item.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- main component

export function ItemList({ categoryId, categoryName, addonGroups }: Props) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [creating, setCreating] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor));

  // Fetch items when category changes
  useEffect(() => {
    if (!categoryId) { setItems([]); return; }
    setLoading(true);
    fetch(`/api/menu/items?categoryId=${categoryId}`)
      .then((r) => r.json())
      .then((data: { items?: MenuItem[] }) => setItems(data.items ?? []))
      .catch(() => toast.error("Failed to load items."))
      .finally(() => setLoading(false));
  }, [categoryId]);

  async function handleToggle(item: MenuItem) {
    const prev = items;
    const next = !item.isAvailable;
    setItems((all) => all.map((i) => (i.id === item.id ? { ...i, isAvailable: next } : i)));

    const res = await fetch(`/api/menu/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAvailable: next }),
    });

    if (!res.ok) {
      setItems(prev);
      toast.error("Failed to update availability.");
    }
  }

  async function handleDelete(item: MenuItem) {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    const prev = items;
    setItems((all) => all.filter((i) => i.id !== item.id));

    const res = await fetch(`/api/menu/items/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      setItems(prev);
      toast.error("Failed to delete item.");
    }
  }

  function handleSaved(saved: MenuItem) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === saved.id);
      if (idx >= 0) {
        return prev.map((i) => (i.id === saved.id ? saved : i));
      }
      return [...prev, saved];
    });
    setEditingItem(null);
    setCreating(false);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIdx, newIdx);
    setItems(reordered);

    try {
      await Promise.all(
        reordered.map((item, idx) =>
          fetch(`/api/menu/items/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: idx }),
          })
        )
      );
    } catch {
      toast.error("Failed to save item order.");
    }
  }

  if (!categoryId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-md text-center">
        <span
          className="grid h-12 w-12 place-items-center rounded-full border border-outline-variant bg-surface-container text-on-surface-variant"
          aria-hidden="true"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
            restaurant_menu
          </span>
        </span>
        <div className="space-y-1">
          <p className="font-display text-title text-on-surface">No category selected</p>
          <p className="measure-sm text-body-sm text-on-surface-variant">
            Pick a category on the left to manage its dishes, or add your first
            one to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* List column. Capped width so rows never stretch into unreadable
          full-width bars on a wide monitor — the rail uses the rest. */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-md">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h2 className="font-display text-headline-sm text-on-surface">{categoryName}</h2>
            {!loading && items.length > 0 && (
              <span className="tabular text-body-sm text-on-surface-variant">
                {items.length} {items.length === 1 ? "item" : "items"}
              </span>
            )}
          </div>
          <Button size="sm" variant="brand" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add item
          </Button>
        </div>

        {/* List */}
        <div className="w-full max-w-4xl">
          {loading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <Skeleton key={n} className="h-[68px] w-full rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-outline-variant px-6 py-16 text-center">
              <span
                className="grid h-12 w-12 place-items-center rounded-full bg-surface-container text-on-surface-variant"
                aria-hidden="true"
              >
                <Plus className="h-5 w-5" />
              </span>
              <div className="space-y-1">
                <p className="font-display text-title text-on-surface">
                  Nothing in {categoryName} yet
                </p>
                <p className="measure-sm text-body-sm text-on-surface-variant">
                  Add a dish and it appears on the live menu immediately.
                </p>
              </div>
              <Button size="sm" variant="brand" onClick={() => setCreating(true)}>
                <Plus className="mr-1 h-4 w-4" /> Add first item
              </Button>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onToggle={() => handleToggle(item)}
                      onEdit={() => setEditingItem(item)}
                      onDelete={() => handleDelete(item)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
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
        addonGroups={addonGroups}
        onClose={() => { setEditingItem(null); setCreating(false); }}
        onSaved={handleSaved}
      />
    </div>
  );
}
