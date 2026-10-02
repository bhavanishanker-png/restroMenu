"use client";

import { useState } from "react";
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
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MenuCategory } from "@/types";
import { MsIcon } from "./MsIcon";

type CategoryWithCount = MenuCategory & { itemCount: number };

type Props = {
  categories: CategoryWithCount[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (updated: CategoryWithCount[]) => void;
  /** Open with the "new category" input already showing. */
  defaultAdding?: boolean;
};

// ---------------------------------------------------------------- draggable row

function CategoryRow({
  cat,
  selected,
  onSelect,
  onRename,
  onDelete,
}: {
  cat: CategoryWithCount;
  selected: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cat.name);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: cat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== cat.name) onRename(trimmed);
    setEditing(false);
  }

  function cancelRename() {
    setDraft(cat.name);
    setEditing(false);
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex min-h-11 items-center gap-1 rounded-xl border pr-1 transition-colors duration-fast",
        selected
          ? "border-brand-border bg-brand-subtle"
          : "border-transparent hover:bg-surface-container",
        isDragging && "z-10 border-outline-variant bg-surface-container-lowest opacity-90 shadow-level-2"
      )}
    >
      {/* Selection bar — position, not just tint, marks the open category. */}
      {selected && (
        <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-brand" aria-hidden="true" />
      )}

      <button
        type="button"
        className="grid h-11 w-8 shrink-0 cursor-grab touch-none place-items-center text-outline hover:text-on-surface-variant active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${cat.name}`}
      >
        <MsIcon name="drag_indicator" />
      </button>

      {editing ? (
        <div className="flex flex-1 items-center gap-1 py-1">
          <Input
            autoFocus
            value={draft}
            aria-label="Category name"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") cancelRename();
            }}
            className="h-9 text-sm"
          />
          <button
            type="button"
            onClick={commitRename}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-on-success-container hover:bg-success-container"
            aria-label="Save name"
          >
            <MsIcon name="check" />
          </button>
          <button
            type="button"
            onClick={cancelRename}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-on-surface-variant hover:bg-surface-container-high"
            aria-label="Cancel rename"
          >
            <MsIcon name="close" />
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
            onClick={onSelect}
            aria-current={selected ? "true" : undefined}
          >
            <span
              className={cn(
                "flex-1 truncate text-sm",
                selected ? "font-semibold text-on-surface" : "font-medium text-on-surface"
              )}
            >
              {cat.name}
            </span>
            <span
              className={cn(
                "grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-semibold tabular-nums",
                selected
                  ? "bg-brand text-brand-foreground"
                  : "bg-surface-container-high text-on-surface-variant"
              )}
              aria-label={`${cat.itemCount} ${cat.itemCount === 1 ? "dish" : "dishes"}`}
            >
              {cat.itemCount}
            </span>
          </button>

          {/* Visible on hover/focus with a mouse; always visible on touch. */}
          <div className="flex shrink-0 opacity-100 transition-opacity duration-fast lg:w-0 lg:overflow-hidden lg:opacity-0 lg:group-focus-within:w-auto lg:group-focus-within:opacity-100 lg:group-hover:w-auto lg:group-hover:opacity-100">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              className="grid h-11 w-9 place-items-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              aria-label={`Rename ${cat.name}`}
            >
              <MsIcon name="edit" size={18} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="grid h-11 w-9 place-items-center rounded-lg text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
              aria-label={`Delete ${cat.name}`}
            >
              <MsIcon name="delete" size={18} />
            </button>
          </div>
        </>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- main component

export function CategoryList({
  categories,
  selectedId,
  onSelect,
  onChange,
  defaultAdding = false,
}: Props) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showAdd, setShowAdd] = useState(defaultAdding);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const prev = categories;
    const oldIdx = categories.findIndex((c) => c.id === active.id);
    const newIdx = categories.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(categories, oldIdx, newIdx).map((c, i) => ({
      ...c,
      sortOrder: i,
    }));

    onChange(reordered);

    // `fetch` only rejects on network failure. A 4xx/5xx used to be ignored,
    // leaving the new order on screen but not saved.
    try {
      const res = await fetch("/api/menu/categories/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: reordered.map((c) => ({ id: c.id, sortOrder: c.sortOrder })) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error("[categories] reorder failed", err);
      onChange(prev);
      toast.error("Couldn't save the new category order. Please try again.");
    }
  }

  async function handleRename(cat: CategoryWithCount, name: string) {
    const prev = categories;
    onChange(prev.map((c) => (c.id === cat.id ? { ...c, name } : c)));

    try {
      const res = await fetch(`/api/menu/categories/${cat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error("[categories] rename failed", err);
      onChange(prev);
      toast.error("Failed to rename category.");
    }
  }

  async function handleDelete(cat: CategoryWithCount) {
    if (!confirm(`Delete category "${cat.name}"? Items will be uncategorised.`)) return;
    const prev = categories;
    onChange(prev.filter((c) => c.id !== cat.id));

    try {
      const res = await fetch(`/api/menu/categories/${cat.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error("[categories] delete failed", err);
      onChange(prev);
      toast.error("Failed to delete category.");
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/menu/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        toast.error("Failed to create category.");
        return;
      }
      const { category } = await res.json() as { category: MenuCategory };
      onChange([...categories, { ...category, itemCount: 0 }]);
      setNewName("");
      setShowAdd(false);
    } catch (err) {
      console.error("[categories] create failed", err);
      toast.error("Failed to create category. Check your connection.");
    } finally {
      setCreating(false);
    }
  }

  function cancelAdd() {
    setNewName("");
    setShowAdd(false);
  }

  return (
    <div className="flex flex-col gap-1">
      {categories.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-0.5">
              {categories.map((cat) => (
                <CategoryRow
                  key={cat.id}
                  cat={cat}
                  selected={selectedId === cat.id}
                  onSelect={() => onSelect(cat.id)}
                  onRename={(name) => handleRename(cat, name)}
                  onDelete={() => handleDelete(cat)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {categories.length === 0 && !showAdd && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-outline-variant px-4 py-6 text-center">
          <MsIcon name="category" size={22} className="text-on-surface-variant" />
          <p className="text-sm font-medium text-on-surface">No categories yet</p>
          <p className="text-xs text-on-surface-variant">
            Group dishes the way your printed menu does.
          </p>
        </div>
      )}

      {showAdd ? (
        <div className="mt-1 flex items-center gap-1 rounded-xl border border-outline-variant bg-surface-container-low p-1.5">
          <Input
            autoFocus
            placeholder="e.g. Starters"
            aria-label="New category name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") cancelAdd();
            }}
            className="h-10 text-sm"
          />
          <Button variant="brand" className="h-10 shrink-0" disabled={creating || !newName.trim()} onClick={handleCreate}>
            {creating ? "Adding…" : "Add"}
          </Button>
          <button
            type="button"
            onClick={cancelAdd}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-on-surface-variant hover:bg-surface-container-high"
            aria-label="Cancel"
          >
            <MsIcon name="close" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="mt-1 flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-outline-variant px-3 text-sm font-medium text-on-surface-variant transition-colors hover:border-outline hover:bg-surface-container hover:text-on-surface"
        >
          <MsIcon name="add" /> Add category
        </button>
      )}
    </div>
  );
}
