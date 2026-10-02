"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
import { formatMoney } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { ExtractedMenu } from "@/app/api/ai/menu-extract/route";
import type { MenuCategory } from "@/types";
import { MsIcon } from "./MsIcon";

type ExtractedItem = ExtractedMenu["categories"][number]["items"][number];

type SelectionState = Record<number, Record<number, boolean>>; // catIdx → itemIdx → selected

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

type Phase = "upload" | "processing" | "review" | "importing" | "done" | "error";

type ApiError = { error?: { message?: string } };

function selectAll(menu: ExtractedMenu): SelectionState {
  const sel: SelectionState = {};
  menu.categories.forEach((cat, ci) => {
    sel[ci] = {};
    cat.items.forEach((_, ii) => { sel[ci][ii] = true; });
  });
  return sel;
}

/** Tri-state tick used for categories and dishes in the review list. */
function Tick({ state }: { state: "on" | "off" | "mixed" }) {
  return (
    <span
      className={cn(
        "grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors",
        state === "off"
          ? "border-outline bg-surface-container-lowest"
          : "border-brand bg-brand text-brand-foreground"
      )}
      aria-hidden="true"
    >
      {state !== "off" && <MsIcon name={state === "on" ? "check" : "remove"} size={14} />}
    </span>
  );
}

export function MenuExtractDialog({ open, onClose, onImported }: Props) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [menu, setMenu] = useState<ExtractedMenu | null>(null);
  const [selection, setSelection] = useState<SelectionState>({});
  const [errorMsg, setErrorMsg] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setPhase("upload");
    setMenu(null);
    setSelection({});
    setErrorMsg("");
    setDragOver(false);
  }

  function handleClose() {
    // Closing from the success screen still needs the page refresh — before,
    // `onImported` fired the instant importing finished, which closed the
    // dialog and reloaded the page so the success screen was never seen.
    const finished = phase === "done";
    reset();
    if (finished) onImported();
    else onClose();
  }

  async function processFile(file: File) {
    setPhase("processing");
    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/ai/menu-extract", { method: "POST", body: fd });
      const json = (await res.json()) as ApiError & { menu?: ExtractedMenu };
      if (!res.ok || !json.menu) {
        setErrorMsg(json.error?.message ?? "Extraction failed.");
        setPhase("error");
        return;
      }

      const extracted = json.menu;
      setMenu(extracted);
      // Default: all items selected
      setSelection(selectAll(extracted));
      setPhase("review");
    } catch (err) {
      console.error("[menu-extract] request failed", err);
      setErrorMsg("Network error. Please try again.");
      setPhase("error");
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
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
  const totalExtracted = menu?.categories.reduce((s, c) => s + c.items.length, 0) ?? 0;

  async function handleImport() {
    if (!menu) return;
    setPhase("importing");
    setProgress({ done: 0, total: selectedItems.length });
    let count = 0;
    let failed = 0;
    let processed = 0;

    // Each request is guarded: a network error used to reject the whole loop
    // and strand the dialog on "Saving items…" forever, and failed rows were
    // skipped silently, so "12 items imported" could really mean 9.
    for (let ci = 0; ci < menu.categories.length; ci++) {
      const cat = menu.categories[ci];
      const selected = cat.items.filter((_, ii) => selection[ci]?.[ii]);
      if (selected.length === 0) continue;

      let category: MenuCategory | null = null;
      try {
        const catRes = await fetch("/api/menu/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: cat.name }),
        });
        if (catRes.ok) {
          ({ category } = (await catRes.json()) as { category: MenuCategory });
        } else {
          console.error("[menu-extract] category create failed", cat.name, catRes.status);
        }
      } catch (err) {
        console.error("[menu-extract] category create failed", cat.name, err);
      }

      if (!category) {
        failed += selected.length;
        processed += selected.length;
        setProgress({ done: processed, total: selectedItems.length });
        continue;
      }

      // Create items under it
      for (const item of selected) {
        try {
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
          else {
            failed++;
            console.error("[menu-extract] item create failed", item.name, itemRes.status);
          }
        } catch (err) {
          failed++;
          console.error("[menu-extract] item create failed", item.name, err);
        }
        processed++;
        setProgress({ done: processed, total: selectedItems.length });
      }
    }

    setImportedCount(count);
    setFailedCount(failed);
    setPhase("done");
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-2xl bg-surface-container-lowest p-0">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-low px-5 pb-4 pt-5 pr-14">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-brand-border bg-brand-subtle text-brand-text">
            <MsIcon name="auto_awesome" size={22} filled />
          </span>
          <div className="min-w-0">
            <DialogTitle className="font-display text-lg text-on-surface">Import menu with AI</DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              {phase === "review"
                ? "Review what we found. Untick anything you don't want."
                : "Upload a photo or PDF of your printed menu."}
            </DialogDescription>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">

          {/* ── Upload ── */}
          {phase === "upload" && (
            <div className="flex flex-col gap-4 p-5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={cn(
                  "flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  dragOver
                    ? "border-brand bg-brand-subtle"
                    : "border-outline-variant hover:border-brand-border hover:bg-surface-container-low"
                )}
              >
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand text-brand-foreground shadow-glow">
                  <MsIcon name="photo_camera" size={28} filled />
                </span>
                <span className="text-center">
                  <span className="block font-display text-title text-on-surface">
                    {dragOver ? "Drop to upload" : "Drop your menu here"}
                  </span>
                  <span className="mt-1 block text-body-sm text-on-surface-variant">
                    JPG, PNG, WebP or PDF · max 10 MB
                  </span>
                </span>
                <span className="inline-flex h-11 items-center gap-1.5 rounded-full border border-brand-border bg-brand-subtle px-5 text-sm font-semibold text-brand-text">
                  <MsIcon name="folder_open" size={18} /> Browse files
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                className="hidden"
                onChange={onFileChange}
              />
              <ol className="grid gap-2 sm:grid-cols-3">
                {[
                  { icon: "upload_file", text: "Upload a clear photo or PDF" },
                  { icon: "auto_awesome", text: "AI drafts categories, dishes & prices" },
                  { icon: "fact_check", text: "You review before anything is saved" },
                ].map((s) => (
                  <li
                    key={s.icon}
                    className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant"
                  >
                    <MsIcon name={s.icon} size={18} className="text-brand-text" />
                    {s.text}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* ── Processing ── skeleton of the review list, not a spinner. */}
          {phase === "processing" && (
            <div className="flex flex-col gap-4 p-5" aria-busy="true">
              <div className="flex items-center gap-3 rounded-xl border border-brand-border bg-brand-subtle px-4 py-3">
                <MsIcon name="auto_awesome" size={22} filled className="animate-pulse text-brand-text" />
                <div>
                  <p className="text-sm font-semibold text-on-surface">Reading your menu…</p>
                  <p className="text-xs text-on-surface-variant">This usually takes 10–20 seconds.</p>
                </div>
              </div>
              {[0, 1].map((g) => (
                <div key={g} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  {[0, 1, 2].map((r) => (
                    <div key={r} className="flex items-center gap-3">
                      <Skeleton className="h-5 w-5 rounded-md" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* ── Error ── */}
          {phase === "error" && (
            <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-error/25 bg-error-container text-on-error-container">
                <MsIcon name="error" size={26} />
              </span>
              <div className="space-y-1">
                <p className="font-display text-title text-on-surface">We couldn&apos;t read that file</p>
                <p className="text-body-sm text-on-surface-variant">{errorMsg}</p>
              </div>
              <Button variant="brand" size="touch" onClick={reset}>
                <MsIcon name="refresh" /> Try another file
              </Button>
            </div>
          )}

          {/* ── Review ── */}
          {phase === "review" && menu && (
            <div>
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest/95 px-5 py-2.5 backdrop-blur">
                <p className="text-sm tabular-nums text-on-surface-variant">
                  <span className="font-semibold text-on-surface">{selectedItems.length}</span> of{" "}
                  {totalExtracted} dishes selected
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 text-brand-text"
                  onClick={() => setSelection(selectAll(menu))}
                >
                  Select all
                </Button>
              </div>
              {menu.categories.map((cat, ci) => {
                const allOn = cat.items.every((_, ii) => selection[ci]?.[ii]);
                const someOn = cat.items.some((_, ii) => selection[ci]?.[ii]);
                return (
                  <div key={ci} className="border-b border-outline-variant last:border-0">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={allOn ? true : someOn ? "mixed" : false}
                      onClick={() => toggleCategory(ci, cat.items)}
                      className="flex min-h-11 w-full items-center gap-3 bg-surface-container-low px-5 py-2 text-left transition-colors hover:bg-surface-container"
                    >
                      <Tick state={allOn ? "on" : someOn ? "mixed" : "off"} />
                      <span className="flex-1 text-sm font-semibold text-on-surface">{cat.name}</span>
                      <span className="text-xs tabular-nums text-on-surface-variant">
                        {cat.items.length} {cat.items.length === 1 ? "dish" : "dishes"}
                      </span>
                    </button>

                    <ul>
                      {cat.items.map((item, ii) => {
                        const on = selection[ci]?.[ii] ?? false;
                        return (
                          <li key={ii}>
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              onClick={() => toggleItem(ci, ii)}
                              className={cn(
                                "flex min-h-11 w-full items-start gap-3 px-5 py-2.5 text-left transition-colors hover:bg-surface-container-low",
                                !on && "opacity-55"
                              )}
                            >
                              <span className="mt-0.5"><Tick state={on ? "on" : "off"} /></span>
                              {item.foodType && (
                                <span className="mt-0.5"><FoodTypeMarker type={item.foodType} /></span>
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-on-surface">{item.name}</span>
                                {item.description && (
                                  <span className="block truncate text-xs text-on-surface-variant">
                                    {item.description}
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-on-surface">
                                {item.basePrice > 0 ? formatMoney(item.basePrice) : "No price"}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Importing ── */}
          {phase === "importing" && (
            <div className="flex flex-col gap-3 px-6 py-10" aria-live="polite">
              <p className="text-center font-display text-title text-on-surface">Saving dishes…</p>
              <div
                className="h-2 overflow-hidden rounded-full bg-surface-container-high"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
              >
                <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-center text-xs tabular-nums text-on-surface-variant">
                {progress.done} of {progress.total}
              </p>
            </div>
          )}

          {/* ── Done ── */}
          {phase === "done" && (
            <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
              <span
                className={cn(
                  "grid h-14 w-14 place-items-center rounded-2xl border",
                  failedCount > 0
                    ? "border-warning/30 bg-warning-container text-on-warning-container"
                    : "border-success/30 bg-success-container text-on-success-container"
                )}
              >
                <MsIcon name={failedCount > 0 ? "warning" : "check_circle"} size={28} filled />
              </span>
              <div className="space-y-1">
                <p className="font-display text-headline-sm text-on-surface">
                  {importedCount} {importedCount === 1 ? "dish" : "dishes"} imported
                </p>
                {failedCount > 0 ? (
                  <p className="text-body-sm text-on-warning-container">
                    {failedCount} couldn&apos;t be saved. Add them by hand from the menu manager.
                  </p>
                ) : (
                  <p className="text-body-sm text-on-surface-variant">
                    Add photos and tweak details from the menu manager.
                  </p>
                )}
              </div>
              <Button variant="brand" size="touch" className="px-8" onClick={handleClose}>
                Done
              </Button>
            </div>
          )}
        </div>

        {/* Footer — only on review phase */}
        {phase === "review" && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-outline-variant bg-surface-container-low px-5 py-3">
            <Button variant="ghost" size="touch" className="px-3" onClick={reset}>
              Different file
            </Button>
            <Button
              variant="brand"
              size="touch"
              onClick={handleImport}
              disabled={selectedItems.length === 0}
            >
              <MsIcon name="download" /> Import {selectedItems.length}{" "}
              {selectedItems.length === 1 ? "dish" : "dishes"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
