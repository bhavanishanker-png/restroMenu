"use client";

import { useEffect, useRef, useState } from "react";
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
import { MAX_IMPORT_PAGES, draftItemIsReady } from "@/lib/ai/draft";
import type {
  ApprovedMenuCategory,
  DraftMenuItem,
  FoodType,
  MenuCategory,
  MenuDraft,
  MenuImportItemDecision,
  MenuImportPageFailure,
  MenuImportPending,
} from "@/types";
import { MsIcon } from "./MsIcon";

type SelectionState = Record<number, Record<number, boolean>>; // catIdx → itemIdx → selected

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

type Phase = "upload" | "processing" | "review" | "importing" | "done" | "error";

type ApiError = { error?: { code?: string; message?: string; details?: string[] } };

/**
 * The paused import's thread id, so the owner can close the dialog and
 * continue later. A per-device convenience only: the draft itself lives on
 * the server (LangGraph checkpoint), and a missing or stale id just means
 * "upload again".
 */
const PENDING_THREAD_KEY = "qbite:menu-import:thread";

function readPendingThread(): string | null {
  try {
    return window.localStorage.getItem(PENDING_THREAD_KEY);
  } catch {
    return null;
  }
}

function writePendingThread(threadId: string | null): void {
  try {
    if (threadId) window.localStorage.setItem(PENDING_THREAD_KEY, threadId);
    else window.localStorage.removeItem(PENDING_THREAD_KEY);
  } catch {
    // Storage blocked (private mode): continuing later just won't be offered.
  }
}

/**
 * Default selection: everything except dishes that look like duplicates of
 * what's already on the menu, so re-importing the same menu doesn't double it.
 */
function defaultSelection(draft: MenuDraft, includeDuplicates = false): SelectionState {
  const sel: SelectionState = {};
  draft.categories.forEach((cat, ci) => {
    sel[ci] = {};
    cat.items.forEach((item, ii) => {
      sel[ci][ii] = includeDuplicates || item.duplicateOf === null;
    });
  });
  return sel;
}

const FOOD_TYPE_OPTIONS: { value: FoodType; label: string }[] = [
  { value: "veg", label: "Veg" },
  { value: "non_veg", label: "Non-veg" },
  { value: "egg", label: "Egg" },
];

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
  const [menu, setMenu] = useState<MenuDraft | null>(null);
  const [selection, setSelection] = useState<SelectionState>({});
  const [errorMsg, setErrorMsg] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // The LangGraph thread paused at review; approving resumes it.
  const [threadId, setThreadId] = useState<string | null>(null);
  const [failedPages, setFailedPages] = useState<MenuImportPageFailure[]>([]);
  const [reviewErrors, setReviewErrors] = useState<string[]>([]);
  const [savedThreadId, setSavedThreadId] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Offer "Continue your last import" if one was left at review.
  useEffect(() => {
    if (open) setSavedThreadId(readPendingThread());
  }, [open]);

  function reset() {
    setPhase("upload");
    setMenu(null);
    setSelection({});
    setErrorMsg("");
    setDragOver(false);
    setThreadId(null);
    setFailedPages([]);
    setReviewErrors([]);
    setResuming(false);
    setSavedThreadId(readPendingThread());
  }

  /** "Different file": the paused import is thrown away on the server too. */
  function discardAndReset() {
    const id = threadId;
    writePendingThread(null);
    reset();
    if (!id) return;
    fetch(`/api/ai/menu-extract/${id}`, { method: "DELETE" }).catch((err: unknown) => {
      // Not fatal: unfinished imports also expire on their own.
      console.error("[menu-extract] discard failed", err);
    });
  }

  function handleClose() {
    // Closing from the success screen still needs the page refresh — before,
    // `onImported` fired the instant importing finished, which closed the
    // dialog and reloaded the page so the success screen was never seen.
    // Closing during review keeps the paused import, to continue later.
    const finished = phase === "done";
    reset();
    if (finished) onImported();
    else onClose();
  }

  function showPending(pending: MenuImportPending) {
    writePendingThread(pending.threadId);
    setThreadId(pending.threadId);
    setFailedPages(pending.failedPages);
    setReviewErrors([]);
    setMenu(pending.draft);
    setSelection(defaultSelection(pending.draft));
    setPhase("review");
  }

  async function processFiles(files: File[]) {
    if (files.length === 0) return;
    if (files.length > MAX_IMPORT_PAGES) {
      setErrorMsg(`Upload at most ${MAX_IMPORT_PAGES} pages at a time.`);
      setPhase("error");
      return;
    }
    setResuming(false);
    setPhase("processing");
    const fd = new FormData();
    files.forEach((file) => fd.append("files", file));

    try {
      const res = await fetch("/api/ai/menu-extract", { method: "POST", body: fd });
      const json = (await res.json()) as ApiError & { pending?: MenuImportPending };
      if (!res.ok || !json.pending) {
        setErrorMsg(json.error?.message ?? "Extraction failed.");
        setPhase("error");
        return;
      }
      showPending(json.pending);
    } catch (err) {
      console.error("[menu-extract] request failed", err);
      setErrorMsg("Network error. Please try again.");
      setPhase("error");
    }
  }

  async function continueSaved() {
    if (!savedThreadId) return;
    setResuming(true);
    setPhase("processing");
    try {
      const res = await fetch(`/api/ai/menu-extract/${savedThreadId}`);
      const json = (await res.json()) as ApiError & { pending?: MenuImportPending };
      if (!res.ok || !json.pending) {
        if (res.status === 404) {
          writePendingThread(null);
          setSavedThreadId(null);
        }
        setErrorMsg(json.error?.message ?? "Couldn't load your last import.");
        setPhase("error");
        return;
      }
      showPending(json.pending);
    } catch (err) {
      console.error("[menu-extract] continue failed", err);
      setErrorMsg("Network error. Please try again.");
      setPhase("error");
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void processFiles(files);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    void processFiles(Array.from(e.dataTransfer.files));
  }

  function toggleItem(ci: number, ii: number) {
    setSelection((prev) => ({
      ...prev,
      [ci]: { ...prev[ci], [ii]: !prev[ci][ii] },
    }));
  }

  /** The owner fills in what the AI couldn't read (price, veg/non-veg). */
  function patchItem(ci: number, ii: number, patch: Partial<Pick<DraftMenuItem, "basePrice" | "foodType">>) {
    setMenu((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        categories: prev.categories.map((cat, c) =>
          c !== ci
            ? cat
            : { ...cat, items: cat.items.map((item, i) => (i !== ii ? item : { ...item, ...patch })) }
        ),
      };
    });
  }

  function toggleCategory(ci: number, items: DraftMenuItem[]) {
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
  const totalExtracted = menu?.totalItems ?? 0;
  // A selected dish without a price or veg/non-veg marker can't be saved —
  // the old import silently defaulted unknown dishes to "veg".
  const needsInput = selectedItems.filter(({ item }) => !draftItemIsReady(item)).length;

  /**
   * Step 1: resume the paused graph with the owner's choices. The server
   * validates them (validate node) and either returns the approved dishes or
   * stays paused with errors. Step 2: save the approved dishes.
   */
  async function handleImport() {
    if (!menu || !threadId || needsInput > 0) return;
    setReviewErrors([]);
    setPhase("importing");
    setProgress({ done: 0, total: selectedItems.length });

    const decisions: MenuImportItemDecision[] = menu.categories.flatMap((cat, ci) =>
      cat.items.flatMap((item, ii) =>
        selection[ci]?.[ii]
          ? [{ categoryIndex: ci, itemIndex: ii, basePrice: item.basePrice, foodType: item.foodType }]
          : []
      )
    );

    let approved: ApprovedMenuCategory[];
    try {
      const res = await fetch(`/api/ai/menu-extract/${threadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions }),
      });
      const json = (await res.json()) as ApiError & { categories?: ApprovedMenuCategory[] };
      if (res.status === 400) {
        // Still paused at review: show what to fix.
        setReviewErrors(json.error?.details ?? [json.error?.message ?? "Check the selected dishes."]);
        setPhase("review");
        return;
      }
      if (!res.ok || !json.categories) {
        if (res.status === 404) writePendingThread(null);
        setErrorMsg(json.error?.message ?? "Couldn't finish the import.");
        setPhase("error");
        return;
      }
      approved = json.categories;
    } catch (err) {
      console.error("[menu-extract] approve failed", err);
      setReviewErrors(["Network error. Your import is saved; try again."]);
      setPhase("review");
      return;
    }

    // The graph has finished; nothing left to continue.
    writePendingThread(null);
    setThreadId(null);

    const total = approved.reduce((n, cat) => n + cat.items.length, 0);
    setProgress({ done: 0, total });
    let count = 0;
    let failed = 0;
    let processed = 0;

    // Each request is guarded: a network error used to reject the whole loop
    // and strand the dialog on "Saving items…" forever, and failed rows were
    // skipped silently, so "12 items imported" could really mean 9.
    for (const cat of approved) {
      const selected = cat.items;
      if (selected.length === 0) continue;

      // Reuse a category that already exists instead of creating a twin.
      let categoryId: string | null = cat.existingCategoryId;
      if (!categoryId) {
        try {
          const catRes = await fetch("/api/menu/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: cat.name }),
          });
          if (catRes.ok) {
            const { category } = (await catRes.json()) as { category: MenuCategory };
            categoryId = category.id;
          } else {
            console.error("[menu-extract] category create failed", cat.name, catRes.status);
          }
        } catch (err) {
          console.error("[menu-extract] category create failed", cat.name, err);
        }
      }

      if (!categoryId) {
        failed += selected.length;
        processed += selected.length;
        setProgress({ done: processed, total });
        continue;
      }

      // Create items under it. Price and food type are guaranteed by the
      // server's validate step (ApprovedMenuItem), not just by this dialog.
      for (const item of selected) {
        try {
          const itemRes = await fetch("/api/menu/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              categoryId,
              name: item.name,
              description: item.description,
              basePrice: item.basePrice,
              foodType: item.foodType,
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
        setProgress({ done: processed, total });
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
              {savedThreadId && (
                <button
                  type="button"
                  onClick={continueSaved}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-brand-border bg-brand-subtle px-4 py-3 text-left transition-colors hover:bg-brand-subtle/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MsIcon name="history" size={22} className="shrink-0 text-brand-text" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-on-surface">Continue your last import</span>
                    <span className="block text-xs text-on-surface-variant">
                      Pick up where you left off. No need to upload again.
                    </span>
                  </span>
                  <MsIcon name="arrow_forward" size={20} className="shrink-0 text-brand-text" />
                </button>
              )}
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
                    JPG, PNG, WebP or PDF · up to {MAX_IMPORT_PAGES} pages · max 10 MB each
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
                multiple
                className="hidden"
                onChange={onFileChange}
              />
              <ol className="grid gap-2 sm:grid-cols-3">
                {[
                  { icon: "upload_file", text: "Upload a clear photo or PDF" },
                  { icon: "auto_awesome", text: "AI drafts dishes and flags anything unclear" },
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
                  <p className="text-sm font-semibold text-on-surface">
                    {resuming ? "Loading your last import…" : "Reading your menu…"}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {resuming
                      ? "This only takes a moment."
                      : "Pages are read at the same time. This usually takes 20–40 seconds."}
                  </p>
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
                  onClick={() => setSelection(defaultSelection(menu, true))}
                >
                  Select all
                </Button>
              </div>
              {failedPages.length > 0 && (
                <div className="mx-5 mt-3 space-y-1 rounded-xl border border-warning/40 bg-warning-container/40 p-3 text-xs text-on-warning-container" role="status">
                  <p className="flex items-center gap-1 font-semibold">
                    <MsIcon name="warning" size={16} />
                    {failedPages.length === 1 ? "1 page" : `${failedPages.length} pages`} couldn&apos;t be read. The rest are below.
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {failedPages.map((f) => (
                      <li key={f.page}>Page {f.page}: {f.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {reviewErrors.length > 0 && (
                <div className="mx-5 mt-3 space-y-1 rounded-xl border border-error/30 bg-error-container p-3 text-xs text-on-error-container" role="alert">
                  <p className="flex items-center gap-1 font-semibold">
                    <MsIcon name="error" size={16} /> Fix these before importing
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {reviewErrors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
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
                      <span className="flex-1 text-sm font-semibold text-on-surface">
                        {cat.name}
                        {cat.existingCategoryId && (
                          <span className="ml-2 rounded-full border border-outline-variant px-2 py-0.5 text-[11px] font-medium text-on-surface-variant">
                            Adds to existing
                          </span>
                        )}
                      </span>
                      <span className="text-xs tabular-nums text-on-surface-variant">
                        {cat.items.length} {cat.items.length === 1 ? "dish" : "dishes"}
                      </span>
                    </button>

                    <ul>
                      {cat.items.map((item, ii) => {
                        const on = selection[ci]?.[ii] ?? false;
                        const ready = draftItemIsReady(item);
                        return (
                          <li key={ii} className={cn(!on && "opacity-55")}>
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              onClick={() => toggleItem(ci, ii)}
                              className="flex min-h-11 w-full items-start gap-3 px-5 py-2.5 text-left transition-colors hover:bg-surface-container-low"
                            >
                              <span className="mt-0.5"><Tick state={on ? "on" : "off"} /></span>
                              {item.foodType && (
                                <span className="mt-0.5"><FoodTypeMarker type={item.foodType} /></span>
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-on-surface">{item.name}</span>
                                {item.description && (
                                  <span className="block truncate text-xs text-on-surface-variant">
                                    {item.descriptionSource === "ai" && (
                                      <span className="mr-1 font-semibold text-brand-text">AI draft ·</span>
                                    )}
                                    {item.description}
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-on-surface">
                                {item.basePrice !== null ? formatMoney(item.basePrice) : "No price"}
                              </span>
                            </button>

                            {/* Notes the owner should read; text + icon, never colour alone. */}
                            {(item.duplicateOf || item.sizeOptionsText) && (
                              <div className="space-y-1 px-5 pb-2 pl-[52px] text-xs">
                                {item.duplicateOf && (
                                  <p className="flex items-center gap-1 text-on-warning-container">
                                    <MsIcon name="content_copy" size={14} />
                                    Already on your menu as &ldquo;{item.duplicateOf}&rdquo; — unticked
                                  </p>
                                )}
                                {item.sizeOptionsText && (
                                  <p className="flex items-center gap-1 text-on-surface-variant">
                                    <MsIcon name="straighten" size={14} />
                                    Sizes: {item.sizeOptionsText} — add them as variants after importing
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Fields the AI couldn't fill with confidence. */}
                            {on && !ready && (
                              <div className="mx-5 mb-2.5 ml-[52px] space-y-2 rounded-xl border border-warning/40 bg-warning-container/40 p-2.5">
                                <p className="flex items-center gap-1 text-xs font-semibold text-on-warning-container">
                                  <MsIcon name="edit_note" size={16} /> Needs your input
                                </p>
                                {item.foodType === null && (
                                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Food type for ${item.name}`}>
                                    {FOOD_TYPE_OPTIONS.map((opt) => (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => patchItem(ci, ii, { foodType: opt.value })}
                                        className="flex h-11 items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-xs font-semibold text-on-surface hover:border-brand-border"
                                      >
                                        <FoodTypeMarker type={opt.value} /> {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {item.basePrice === null && (
                                  <label className="flex items-center gap-2 text-xs text-on-surface-variant">
                                    Price
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      min={1}
                                      max={99999}
                                      placeholder="e.g. 180"
                                      onBlur={(e) => {
                                        const value = Number(e.target.value);
                                        if (Number.isFinite(value) && value > 0 && value <= 99999) {
                                          patchItem(ci, ii, { basePrice: value });
                                        }
                                      }}
                                      className="h-11 w-28 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm tabular-nums text-on-surface"
                                    />
                                  </label>
                                )}
                              </div>
                            )}
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
            <Button variant="ghost" size="touch" className="px-3" onClick={discardAndReset}>
              Different file
            </Button>
            {needsInput > 0 && (
              <p className="text-xs text-on-warning-container" role="status">
                {needsInput} {needsInput === 1 ? "dish needs" : "dishes need"} a price or veg/non-veg
              </p>
            )}
            <Button
              variant="brand"
              size="touch"
              onClick={handleImport}
              disabled={selectedItems.length === 0 || needsInput > 0}
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
