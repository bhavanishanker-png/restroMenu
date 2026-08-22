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
import { GripVertical, Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
import type { AddonGroup, MenuItem } from "@/types";
import { ItemEditorSheet } from "./ItemEditorSheet";

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
      className="group flex items-center gap-3 rounded-lg border border-stone-100 bg-white px-3 py-3 shadow-sm"
    >
      {/* Drag handle */}
      <button
        className="cursor-grab touch-none text-stone-300 hover:text-stone-500"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Thumbnail */}
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-stone-100">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-stone-300 text-xs">
            No img
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <FoodTypeMarker type={item.foodType} />
          <span className={`text-sm font-medium truncate ${!item.isAvailable ? "text-stone-400" : "text-stone-900"}`}>
            {item.name}
          </span>
          {!item.isAvailable && (
            <span className="shrink-0 rounded bg-stone-100 px-1 py-0.5 text-xs text-stone-400">
              Unavailable
            </span>
          )}
        </div>
        <span className="text-xs text-stone-500">₹{item.basePrice.toFixed(2)}</span>
      </div>

      {/* Availability toggle — the most-used control */}
      <Switch
        checked={item.isAvailable}
        onCheckedChange={onToggle}
        aria-label={item.isAvailable ? "Mark unavailable" : "Mark available"}
      />

      {/* Actions */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100">
        <button
          onClick={onEdit}
          className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          aria-label="Edit"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-red-500"
          aria-label="Delete"
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
      <div className="flex flex-1 items-center justify-center text-stone-400">
        Select a category to see items.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-stone-800">{categoryName}</h2>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add item
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-stone-200 py-16 text-stone-400">
          <p className="text-sm">No items in this category.</p>
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
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
