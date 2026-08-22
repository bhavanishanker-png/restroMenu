"use client";

import { useState } from "react";
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
import { GripVertical, Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MenuCategory } from "@/types";

type CategoryWithCount = MenuCategory & { itemCount: number };

type Props = {
  categories: CategoryWithCount[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (updated: CategoryWithCount[]) => void;
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
    opacity: isDragging ? 0.5 : 1,
  };

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== cat.name) onRename(trimmed);
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors ${
        selected ? "bg-[#C2410C]/10 text-[#C2410C]" : "hover:bg-stone-100"
      }`}
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

      {editing ? (
        <div className="flex flex-1 items-center gap-1">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setDraft(cat.name); setEditing(false); }
            }}
            className="h-7 text-sm"
          />
          <button onClick={commitRename} className="text-green-600 hover:text-green-700">
            <Check className="h-4 w-4" />
          </button>
          <button onClick={() => { setDraft(cat.name); setEditing(false); }} className="text-stone-400">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button className="flex flex-1 items-center gap-2 text-left text-sm font-medium" onClick={onSelect}>
          <span className="flex-1 truncate">{cat.name}</span>
          <Badge variant="secondary" className="text-xs">{cat.itemCount}</Badge>
        </button>
      )}

      {!editing && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="rounded p-0.5 text-stone-400 hover:text-stone-600"
            aria-label="Rename"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded p-0.5 text-stone-400 hover:text-red-500"
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- main component

export function CategoryList({ categories, selectedId, onSelect, onChange }: Props) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = categories.findIndex((c) => c.id === active.id);
    const newIdx = categories.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(categories, oldIdx, newIdx).map((c, i) => ({
      ...c,
      sortOrder: i,
    }));

    onChange(reordered);

    try {
      await fetch("/api/menu/categories/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: reordered.map((c) => ({ id: c.id, sortOrder: c.sortOrder })) }),
      });
    } catch {
      toast.error("Failed to save category order.");
    }
  }

  async function handleRename(cat: CategoryWithCount, name: string) {
    const prev = categories;
    onChange(prev.map((c) => (c.id === cat.id ? { ...c, name } : c)));

    const res = await fetch(`/api/menu/categories/${cat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      onChange(prev);
      toast.error("Failed to rename category.");
    }
  }

  async function handleDelete(cat: CategoryWithCount) {
    if (!confirm(`Delete category "${cat.name}"? Items will be uncategorised.`)) return;
    const prev = categories;
    onChange(prev.filter((c) => c.id !== cat.id));

    const res = await fetch(`/api/menu/categories/${cat.id}`, { method: "DELETE" });
    if (!res.ok) {
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
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
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
        </SortableContext>
      </DndContext>

      {categories.length === 0 && !showAdd && (
        <p className="px-2 py-4 text-center text-sm text-stone-400">No categories yet.</p>
      )}

      {showAdd ? (
        <div className="mt-1 flex items-center gap-1 px-2">
          <Input
            autoFocus
            placeholder="Category name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setNewName(""); setShowAdd(false); }
            }}
            className="h-8 text-sm"
          />
          <Button size="sm" disabled={creating} onClick={handleCreate}>
            {creating ? "…" : "Add"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setNewName(""); setShowAdd(false); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="mt-1 flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-stone-500 hover:bg-stone-100 hover:text-stone-700"
        >
          <Plus className="h-4 w-4" /> Add category
        </button>
      )}
    </div>
  );
}
