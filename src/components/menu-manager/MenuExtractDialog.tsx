"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExtractedMenu } from "@/app/api/ai/menu-extract/route";

type ExtractedItem = ExtractedMenu["categories"][number]["items"][number];
type ExtractedCategory = ExtractedMenu["categories"][number];

type SelectionState = Record<number, Record<number, boolean>>; // catIdx → itemIdx → selected

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

type Phase = "upload" | "processing" | "review" | "importing" | "done" | "error";

export function MenuExtractDialog({ open, onClose, onImported }: Props) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [menu, setMenu] = useState<ExtractedMenu | null>(null);
  const [selection, setSelection] = useState<SelectionState>({});
  const [errorMsg, setErrorMsg] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setPhase("upload");
    setMenu(null);
    setSelection({});
    setErrorMsg("");
    setDragOver(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function processFile(file: File) {
    setPhase("processing");
    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/ai/menu-extract", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error?.message ?? "Extraction failed.");
        setPhase("error");
        return;
      }

      const extracted = json.menu as ExtractedMenu;
      setMenu(extracted);

      // Default: all items selected
      const sel: SelectionState = {};
      extracted.categories.forEach((cat, ci) => {
        sel[ci] = {};
        cat.items.forEach((_, ii) => { sel[ci][ii] = true; });
      });
      setSelection(sel);
      setPhase("review");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setPhase("error");
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function toggleItem(ci: number, ii: number) {
    setSelection((prev) => ({
      ...prev,
      [ci]: { ...prev[ci], [ii]: !prev[ci][ii] },
    }));
  }

  function toggleCategory(ci: number, items: ExtractedItem[]) {
    const allOn = items.every((_, ii) => selection[ci]?.[ii]);
    setSelection((prev) => {
      const next: SelectionState = { ...prev, [ci]: {} };
      items.forEach((_, ii) => { next[ci][ii] = !allOn; });
      return next;
    });
  }

  const selectedItems = menu?.categories.flatMap((cat, ci) =>
    cat.items.filter((_, ii) => selection[ci]?.[ii]).map((item) => ({ cat, item }))
  ) ?? [];

  async function handleImport() {
    if (!menu) return;
    setPhase("importing");
    let count = 0;

    for (let ci = 0; ci < menu.categories.length; ci++) {
      const cat = menu.categories[ci];
      const selected = cat.items.filter((_, ii) => selection[ci]?.[ii]);
      if (selected.length === 0) continue;

      // Create category
      const catRes = await fetch("/api/menu/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cat.name }),
      });
      if (!catRes.ok) continue;
      const { category } = await catRes.json();

      // Create items under it
      for (const item of selected) {
        const itemRes = await fetch("/api/menu/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: category.id,
            name: item.name,
            description: item.description ?? null,
            basePrice: item.basePrice,
            foodType: item.foodType ?? "veg",
            imageUrl: null,
            isAvailable: true,
            variants: [],
            addonGroupIds: [],
          }),
        });
        if (itemRes.ok) count++;
      }
    }

    setImportedCount(count);
    setPhase("done");
    onImported();
  }

  function foodBadge(type: ExtractedItem["foodType"]) {
    if (type === "veg")
      return <span className="inline-block w-3.5 h-3.5 rounded-sm border-2 border-[#388e3c] flex-shrink-0" style={{ backgroundColor: "#388e3c22" }} />;
    if (type === "non_veg")
      return <span className="inline-block w-3.5 h-3.5 rounded-sm border-2 border-[#c62828] flex-shrink-0" style={{ backgroundColor: "#c6282822" }} />;
    if (type === "egg")
      return <span className="inline-block w-3.5 h-3.5 rounded-sm border-2 border-[#f9a825] flex-shrink-0" style={{ backgroundColor: "#f9a82522" }} />;
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className="max-w-xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl p-0 bg-surface gap-0"
        aria-describedby={undefined}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-outline-variant/30 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container">
            <span className="material-symbols-outlined text-on-primary-container" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>
              auto_awesome
            </span>
          </div>
          <div>
            <DialogTitle className="font-headline-sm text-on-surface" style={{ fontSize: 16 }}>
              AI Menu Extractor
            </DialogTitle>
            <p className="font-body-sm text-on-surface-variant" style={{ fontSize: 12 }}>
              Upload a photo or PDF of your printed menu
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Upload ── */}
          {phase === "upload" && (
            <div className="p-6 flex flex-col items-center gap-4">
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`w-full cursor-pointer rounded-2xl border-2 border-dashed p-10 flex flex-col items-center gap-3 transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-outline-variant hover:border-primary hover:bg-surface-container-low"
                }`}
              >
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 48, fontVariationSettings: "'FILL' 1" }}>
                  photo_camera
                </span>
                <div className="text-center">
                  <p className="font-headline-sm text-on-surface" style={{ fontSize: 15 }}>
                    Drop your menu here
                  </p>
                  <p className="font-body-sm text-on-surface-variant mt-1" style={{ fontSize: 13 }}>
                    JPG, PNG, WebP, or PDF · Max 10 MB
                  </p>
                </div>
                <span className="rounded-full bg-primary-container text-on-primary-container font-label-bold px-4 py-1.5" style={{ fontSize: 13 }}>
                  Browse file
                </span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                className="hidden"
                onChange={onFileChange}
              />
              <p className="font-body-sm text-on-surface-variant text-center" style={{ fontSize: 12 }}>
                Claude reads your menu and extracts every item, price, and category automatically.
              </p>
            </div>
          )}

          {/* ── Processing ── */}
          {phase === "processing" && (
            <div className="p-10 flex flex-col items-center gap-4">
              <div className="relative flex h-16 w-16 items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-primary-container" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 28, fontVariationSettings: "'FILL' 1" }}>
                  auto_awesome
                </span>
              </div>
              <div className="text-center">
                <p className="font-headline-sm text-on-surface" style={{ fontSize: 16 }}>Claude is reading your menu…</p>
                <p className="font-body-sm text-on-surface-variant mt-1" style={{ fontSize: 13 }}>
                  This usually takes 10–20 seconds
                </p>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {phase === "error" && (
            <div className="p-6 flex flex-col items-center gap-4">
              <span className="material-symbols-outlined text-error" style={{ fontSize: 48 }}>error</span>
              <p className="font-headline-sm text-on-surface text-center">{errorMsg}</p>
              <button
                onClick={reset}
                className="rounded-full bg-primary text-on-primary font-label-bold px-6 py-2 hover:bg-surface-tint transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {/* ── Review ── */}
          {phase === "review" && menu && (
            <div className="divide-y divide-outline-variant/30">
              <div className="px-6 py-3 bg-surface-container-low flex items-center justify-between">
                <p className="font-body-sm text-on-surface-variant" style={{ fontSize: 13 }}>
                  {selectedItems.length} of{" "}
                  {menu.categories.reduce((s, c) => s + c.items.length, 0)} items selected
                </p>
                <button
                  onClick={() => {
                    const sel: SelectionState = {};
                    menu.categories.forEach((cat, ci) => {
                      sel[ci] = {};
                      cat.items.forEach((_, ii) => { sel[ci][ii] = true; });
                    });
                    setSelection(sel);
                  }}
                  className="font-label-bold text-primary hover:underline"
                  style={{ fontSize: 12 }}
                >
                  Select all
                </button>
              </div>
              {menu.categories.map((cat, ci) => (
                <div key={ci}>
                  {/* Category header */}
                  <button
                    onClick={() => toggleCategory(ci, cat.items)}
                    className="w-full flex items-center gap-2 px-6 py-2.5 bg-surface-container-low hover:bg-surface-container text-left transition-colors"
                  >
                    <div className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                      cat.items.every((_, ii) => selection[ci]?.[ii])
                        ? "bg-primary border-primary"
                        : cat.items.some((_, ii) => selection[ci]?.[ii])
                        ? "bg-primary/40 border-primary"
                        : "border-outline-variant"
                    }`}>
                      {cat.items.some((_, ii) => selection[ci]?.[ii]) && (
                        <span className="material-symbols-outlined text-on-primary" style={{ fontSize: 12 }}>
                          {cat.items.every((_, ii) => selection[ci]?.[ii]) ? "check" : "remove"}
                        </span>
                      )}
                    </div>
                    <span className="font-label-bold text-on-surface flex-1" style={{ fontSize: 13 }}>
                      {cat.name}
                    </span>
                    <span className="font-body-sm text-on-surface-variant" style={{ fontSize: 12 }}>
                      {cat.items.length} items
                    </span>
                  </button>

                  {/* Items */}
                  {cat.items.map((item, ii) => (
                    <button
                      key={ii}
                      onClick={() => toggleItem(ci, ii)}
                      className={`w-full flex items-start gap-3 px-6 py-2.5 text-left transition-colors hover:bg-surface-container-low ${
                        selection[ci]?.[ii] ? "bg-surface" : "bg-surface opacity-50"
                      }`}
                    >
                      <div className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                        selection[ci]?.[ii] ? "bg-primary border-primary" : "border-outline-variant"
                      }`}>
                        {selection[ci]?.[ii] && (
                          <span className="material-symbols-outlined text-on-primary" style={{ fontSize: 12 }}>check</span>
                        )}
                      </div>
                      <div className="flex flex-1 items-start gap-2 min-w-0">
                        {foodBadge(item.foodType)}
                        <div className="flex-1 min-w-0">
                          <p className="font-body-md text-on-surface truncate" style={{ fontSize: 13 }}>
                            {item.name}
                          </p>
                          {item.description && (
                            <p className="font-body-sm text-on-surface-variant truncate" style={{ fontSize: 11 }}>
                              {item.description}
                            </p>
                          )}
                        </div>
                        <span className="font-label-bold text-primary flex-shrink-0" style={{ fontSize: 13 }}>
                          {item.basePrice > 0 ? `₹${item.basePrice}` : "—"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* ── Importing ── */}
          {phase === "importing" && (
            <div className="p-10 flex flex-col items-center gap-4">
              <div className="relative flex h-16 w-16 items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-primary-container" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 28, fontVariationSettings: "'FILL' 1" }}>
                  upload
                </span>
              </div>
              <p className="font-headline-sm text-on-surface" style={{ fontSize: 16 }}>Saving items…</p>
            </div>
          )}

          {/* ── Done ── */}
          {phase === "done" && (
            <div className="p-10 flex flex-col items-center gap-4">
              <span className="material-symbols-outlined text-[#388e3c]" style={{ fontSize: 56, fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <div className="text-center">
                <p className="font-headline-sm text-on-surface" style={{ fontSize: 18 }}>
                  {importedCount} items imported!
                </p>
                <p className="font-body-sm text-on-surface-variant mt-1" style={{ fontSize: 13 }}>
                  Your menu is ready. Add photos and tweak details from the menu manager.
                </p>
              </div>
              <button
                onClick={handleClose}
                className="rounded-full bg-primary text-on-primary font-label-bold px-8 py-2.5 hover:bg-surface-tint transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Footer — only on review phase */}
        {phase === "review" && (
          <div className="shrink-0 flex items-center justify-between gap-3 border-t border-outline-variant/30 px-6 py-4 bg-surface-container-lowest">
            <button
              onClick={reset}
              className="font-label-bold text-on-surface-variant hover:text-on-surface transition-colors"
              style={{ fontSize: 14 }}
            >
              Upload different file
            </button>
            <button
              onClick={handleImport}
              disabled={selectedItems.length === 0}
              className="flex items-center gap-2 rounded-full bg-primary text-on-primary font-label-bold px-6 py-2.5 shadow-[0_4px_12px_rgba(167,52,0,0.3)] hover:bg-surface-tint transition-all active:translate-y-[1px] disabled:opacity-40"
              style={{ fontSize: 14 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
              Import {selectedItems.length} items
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
