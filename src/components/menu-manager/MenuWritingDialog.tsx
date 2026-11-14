"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
  DishWritingDecision,
  DishWritingResult,
  MenuCategory,
  MenuItem,
  MenuWritingPending,
} from "@/types";
import { MsIcon } from "./MsIcon";

type Props = {
  open: boolean;
  categories: MenuCategory[];
  onClose: () => void;
  onSaved: () => void;
};

type Phase = "pick" | "writing" | "review" | "saving" | "done" | "error";

type ApiError = { error?: { message?: string; details?: string[] } };

/** Same limit as the server (MAX_WRITING_DISHES); kept here so the client bundle has no LangGraph import. */
const MAX_DISHES = 40;

const PENDING_KEY = "qbite:menu-writing:thread";

function readPending(): string | null {
  try {
    return window.localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

function writePending(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(PENDING_KEY, id);
    else window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked: "continue later" just isn't offered.
  }
}

const hasHindi = (item: MenuItem) => (item.translations ?? []).some((t) => t.locale === "hi");

/** Owner-editable text for one dish during review. */
type Draft = { save: boolean; descriptionEn: string; nameHi: string; descriptionHi: string };

function toDrafts(dishes: DishWritingResult[]): Record<string, Draft> {
  const drafts: Record<string, Draft> = {};
  for (const d of dishes) {
    drafts[d.itemId] = {
      // A dish the AI couldn't name in Hindi starts unticked: nothing to save yet.
      save: d.nameHi !== null,
      descriptionEn: d.descriptionEn ?? "",
      nameHi: d.nameHi ?? "",
      descriptionHi: d.descriptionHi ?? "",
    };
  }
  return drafts;
}

export function MenuWritingDialog({ open, categories, onClose, onSaved }: Props) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<MenuWritingPending | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [savedThread, setSavedThread] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  // Load every dish when the dialog opens; pre-tick the ones that need text.
  useEffect(() => {
    if (!open) return;
    setSavedThread(readPending());
    setItems(null);
    setLoadError("");
    fetch("/api/menu/items")
      .then(async (res) => {
        const json = (await res.json()) as ApiError & { items?: MenuItem[] };
        if (!res.ok || !json.items) throw new Error(json.error?.message ?? "Failed to load dishes.");
        setItems(json.items);
        const needs = json.items.filter((i) => !i.description || !hasHindi(i)).slice(0, MAX_DISHES);
        setPicked(new Set(needs.map((i) => i.id)));
      })
      .catch((err: unknown) => {
        console.error("[menu-writing] load dishes failed", err);
        setLoadError("Couldn't load your dishes. Close and try again.");
      });
  }, [open]);

  const grouped = useMemo(() => {
    if (!items) return [];
    const byCat = new Map<string | null, MenuItem[]>();
    for (const item of items) {
      const list = byCat.get(item.categoryId) ?? [];
      list.push(item);
      byCat.set(item.categoryId, list);
    }
    const named = categories
      .filter((c) => byCat.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, items: byCat.get(c.id) ?? [] }));
    const loose = byCat.get(null);
    return loose ? [...named, { id: "none", name: "No category", items: loose }] : named;
  }, [items, categories]);

  function reset() {
    setPhase("pick");
    setPending(null);
    setDrafts({});
    setErrors([]);
    setErrorMsg("");
    setResuming(false);
    setSavedThread(readPending());
  }

  function handleClose() {
    const finished = phase === "done";
    reset();
    if (finished) onSaved();
    else onClose(); // a run at review stays paused, to continue later
  }

  function discard() {
    const id = pending?.threadId;
    writePending(null);
    reset();
    if (id) {
      fetch(`/api/ai/menu-writing/${id}`, { method: "DELETE" }).catch((err: unknown) =>
        console.error("[menu-writing] discard failed", err)
      );
    }
  }

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_DISHES) next.add(id);
      return next;
    });
  }

  function showPending(p: MenuWritingPending) {
    writePending(p.threadId);
    setPending(p);
    setDrafts(toDrafts(p.dishes));
    setErrors([]);
    setPhase("review");
  }

  async function startRun() {
    if (picked.size === 0) return;
    setResuming(false);
    setPhase("writing");
    try {
      const res = await fetch("/api/ai/menu-writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: Array.from(picked) }),
      });
      const json = (await res.json()) as ApiError & { pending?: MenuWritingPending };
      if (!res.ok || !json.pending) {
        setErrorMsg(json.error?.message ?? "The AI couldn't write those dishes.");
        setPhase("error");
        return;
      }
      showPending(json.pending);
    } catch (err) {
      console.error("[menu-writing] start failed", err);
      setErrorMsg("Network error. Please try again.");
      setPhase("error");
    }
  }

  async function continueSaved() {
    if (!savedThread) return;
    setResuming(true);
    setPhase("writing");
    try {
      const res = await fetch(`/api/ai/menu-writing/${savedThread}`);
      const json = (await res.json()) as ApiError & { pending?: MenuWritingPending };
      if (!res.ok || !json.pending) {
        if (res.status === 404) {
          writePending(null);
          setSavedThread(null);
        }
        setErrorMsg(json.error?.message ?? "Couldn't load your last run.");
        setPhase("error");
        return;
      }
      showPending(json.pending);
    } catch (err) {
      console.error("[menu-writing] continue failed", err);
      setErrorMsg("Network error. Please try again.");
      setPhase("error");
    }
  }

  function patch(id: string, change: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...change } }));
  }

  const toSave = pending?.dishes.filter((d) => drafts[d.itemId]?.save) ?? [];
  const missingHindi = toSave.filter((d) => !drafts[d.itemId]?.nameHi.trim()).length;

  async function save() {
    if (!pending || toSave.length === 0 || missingHindi > 0) return;
    setErrors([]);
    setPhase("saving");
    const decisions: DishWritingDecision[] = toSave.map((d) => {
      const draft = drafts[d.itemId];
      return {
        itemId: d.itemId,
        descriptionEn: d.currentDescription ? null : draft.descriptionEn.trim() || null,
        nameHi: draft.nameHi,
        descriptionHi: draft.descriptionHi.trim() || null,
      };
    });
    try {
      const res = await fetch(`/api/ai/menu-writing/${pending.threadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions }),
      });
      const json = (await res.json()) as ApiError & { saved?: number };
      if (res.status === 400) {
        setErrors(json.error?.details ?? [json.error?.message ?? "Check the dishes and try again."]);
        setPhase("review");
        return;
      }
      if (!res.ok) {
        if (res.status === 404) writePending(null);
        // A 500 keeps the run: saving again retries without a new AI call.
        setErrors([json.error?.message ?? "Couldn't save. Try again."]);
        setPhase(res.status === 404 ? "error" : "review");
        if (res.status === 404) setErrorMsg(json.error?.message ?? "This run has expired.");
        return;
      }
      writePending(null);
      setSavedCount(json.saved ?? 0);
      setPhase("done");
    } catch (err) {
      console.error("[menu-writing] save failed", err);
      setErrors(["Network error. Your run is kept; try again."]);
      setPhase("review");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl bg-surface-container-lowest p-0">
        <div className="flex shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-low px-5 pb-4 pt-5 pr-14">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-brand-border bg-brand-subtle text-brand-text">
            <MsIcon name="translate" size={22} />
          </span>
          <div className="min-w-0">
            <DialogTitle className="font-display text-lg text-on-surface">Descriptions &amp; Hindi with AI</DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              {phase === "review"
                ? "Check and edit before saving. Nothing is saved until you click Save."
                : "AI writes missing English descriptions and translates names and descriptions into Hindi."}
            </DialogDescription>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* ── Pick dishes ── */}
          {phase === "pick" && (
            <div className="flex flex-col gap-3 p-5">
              {savedThread && (
                <button
                  type="button"
                  onClick={continueSaved}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-brand-border bg-brand-subtle px-4 py-3 text-left hover:bg-brand-subtle/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MsIcon name="history" size={22} className="shrink-0 text-brand-text" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-on-surface">Continue your last run</span>
                    <span className="block text-xs text-on-surface-variant">Review what the AI already wrote.</span>
                  </span>
                  <MsIcon name="arrow_forward" size={20} className="shrink-0 text-brand-text" />
                </button>
              )}

              {loadError && <p className="text-sm text-on-error-container" role="alert">{loadError}</p>}

              {!items && !loadError && (
                <div className="space-y-2" aria-busy="true">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-5 w-5 rounded-md" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </div>
              )}

              {items && items.length === 0 && (
                <div className="rounded-xl border border-outline-variant p-6 text-center text-sm text-on-surface-variant">
                  No dishes yet. Add dishes or import your menu first, then come back to write descriptions and Hindi.
                </div>
              )}

              {items && items.length > 0 && (
                <>
                  <p className="text-xs text-on-surface-variant">
                    Dishes missing a description or Hindi are ticked. Up to {MAX_DISHES} per run.
                  </p>
                  {grouped.map((cat) => (
                    <div key={cat.id}>
                      <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{cat.name}</p>
                      <ul className="overflow-hidden rounded-xl border border-outline-variant">
                        {cat.items.map((item) => {
                          const on = picked.has(item.id);
                          return (
                            <li key={item.id} className="border-b border-outline-variant last:border-0">
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                onClick={() => togglePick(item.id)}
                                className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-container-low"
                              >
                                <span
                                  className={cn(
                                    "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                                    on ? "border-brand bg-brand text-brand-foreground" : "border-outline bg-surface-container-lowest"
                                  )}
                                  aria-hidden="true"
                                >
                                  {on && <MsIcon name="check" size={14} />}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{item.name}</span>
                                <span className="flex shrink-0 gap-1 text-[11px]">
                                  {!item.description && (
                                    <span className="rounded-full border border-outline-variant px-2 py-0.5 text-on-surface-variant">No description</span>
                                  )}
                                  <span
                                    className={cn(
                                      "rounded-full border px-2 py-0.5",
                                      hasHindi(item)
                                        ? "border-success/30 text-on-success-container"
                                        : "border-outline-variant text-on-surface-variant"
                                    )}
                                  >
                                    {hasHindi(item) ? "✓ हिंदी" : "No Hindi"}
                                  </span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ── Writing ── skeleton, not a spinner */}
          {phase === "writing" && (
            <div className="flex flex-col gap-4 p-5" aria-busy="true">
              <div className="flex items-center gap-3 rounded-xl border border-brand-border bg-brand-subtle px-4 py-3">
                <MsIcon name="auto_awesome" size={22} filled className="animate-pulse text-brand-text" />
                <div>
                  <p className="text-sm font-semibold text-on-surface">
                    {resuming ? "Loading your last run…" : `Writing ${picked.size} ${picked.size === 1 ? "dish" : "dishes"}…`}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {resuming
                      ? "This only takes a moment."
                      : "5 at a time. Text that fails a safety check is rewritten automatically."}
                  </p>
                </div>
              </div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2 rounded-xl border border-outline-variant p-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
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
              <p className="text-body-sm text-on-surface-variant">{errorMsg}</p>
              <Button variant="brand" size="touch" onClick={reset}>
                <MsIcon name="refresh" /> Start again
              </Button>
            </div>
          )}

          {/* ── Review ── */}
          {(phase === "review" || phase === "saving") && pending && (
            <div className="flex flex-col gap-3 p-5">
              {errors.length > 0 && (
                <div className="space-y-1 rounded-xl border border-error/30 bg-error-container p-3 text-xs text-on-error-container" role="alert">
                  <p className="flex items-center gap-1 font-semibold">
                    <MsIcon name="error" size={16} /> Fix these before saving
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {errors.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                </div>
              )}

              {pending.dishes.map((d) => {
                const draft = drafts[d.itemId];
                if (!draft) return null;
                return (
                  <div key={d.itemId} className={cn("rounded-xl border border-outline-variant p-3", !draft.save && "opacity-60")}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={draft.save}
                      onClick={() => patch(d.itemId, { save: !draft.save })}
                      className="flex min-h-11 w-full items-center gap-3 text-left"
                    >
                      <span
                        className={cn(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                          draft.save ? "border-brand bg-brand text-brand-foreground" : "border-outline bg-surface-container-lowest"
                        )}
                        aria-hidden="true"
                      >
                        {draft.save && <MsIcon name="check" size={14} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-on-surface">{d.name}</span>
                        <span className="block text-xs text-on-surface-variant">{d.category}</span>
                      </span>
                      {d.attempts > 1 && !d.flags.length && (
                        <span className="shrink-0 rounded-full border border-outline-variant px-2 py-0.5 text-[11px] text-on-surface-variant">
                          Rewritten to pass safety check
                        </span>
                      )}
                    </button>

                    {/* Flags: icon + text, never colour alone. */}
                    {d.flags.includes("health_claim") && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-on-warning-container">
                        <MsIcon name="health_and_safety" size={16} />
                        The AI kept adding a health or allergy claim, so that text was removed. Write it yourself or leave it blank.
                      </p>
                    )}
                    {d.flags.includes("ai_failed") && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-on-warning-container">
                        <MsIcon name="warning" size={16} />
                        The AI couldn&apos;t finish this dish. Fill in what&apos;s missing, or untick it.
                      </p>
                    )}

                    {draft.save && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">English</p>
                          {d.currentDescription ? (
                            <p className="rounded-lg bg-surface-container-low p-2 text-xs text-on-surface-variant">
                              {d.currentDescription} <span className="italic">(kept as is)</span>
                            </p>
                          ) : (
                            <Textarea
                              aria-label={`English description for ${d.name}`}
                              value={draft.descriptionEn}
                              maxLength={300}
                              onChange={(e) => patch(d.itemId, { descriptionEn: e.target.value })}
                              placeholder="Optional description"
                              className="min-h-[72px] text-sm"
                            />
                          )}
                        </div>
                        <div className="space-y-1" lang="hi">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">हिंदी</p>
                          <Input
                            aria-label={`Hindi name for ${d.name}`}
                            value={draft.nameHi}
                            maxLength={200}
                            onChange={(e) => patch(d.itemId, { nameHi: e.target.value })}
                            placeholder="हिंदी नाम (ज़रूरी)"
                            className="h-11 text-sm"
                          />
                          <Textarea
                            aria-label={`Hindi description for ${d.name}`}
                            value={draft.descriptionHi}
                            maxLength={500}
                            onChange={(e) => patch(d.itemId, { descriptionHi: e.target.value })}
                            placeholder="हिंदी विवरण (वैकल्पिक)"
                            className="min-h-[72px] text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Done ── */}
          {phase === "done" && (
            <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-success/30 bg-success-container text-on-success-container">
                <MsIcon name="check_circle" size={28} filled />
              </span>
              <p className="font-display text-headline-sm text-on-surface">
                {savedCount} {savedCount === 1 ? "dish" : "dishes"} updated
              </p>
              <p className="text-body-sm text-on-surface-variant">Diners can now switch your menu to हिंदी.</p>
              <Button variant="brand" size="touch" className="px-8" onClick={handleClose}>
                Done
              </Button>
            </div>
          )}
        </div>

        {phase === "pick" && items && items.length > 0 && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-outline-variant bg-surface-container-low px-5 py-3">
            <p className="text-xs tabular-nums text-on-surface-variant">
              {picked.size} of {Math.min(items.length, MAX_DISHES)} max selected
            </p>
            <Button variant="brand" size="touch" onClick={startRun} disabled={picked.size === 0}>
              <MsIcon name="auto_awesome" /> Write for {picked.size} {picked.size === 1 ? "dish" : "dishes"}
            </Button>
          </div>
        )}

        {(phase === "review" || phase === "saving") && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-outline-variant bg-surface-container-low px-5 py-3">
            <Button variant="ghost" size="touch" className="px-3" onClick={discard} disabled={phase === "saving"}>
              Discard
            </Button>
            {missingHindi > 0 && (
              <p className="text-xs text-on-warning-container" role="status">
                {missingHindi} {missingHindi === 1 ? "dish needs" : "dishes need"} a Hindi name
              </p>
            )}
            <Button
              variant="brand"
              size="touch"
              onClick={save}
              disabled={phase === "saving" || toSave.length === 0 || missingHindi > 0}
            >
              <MsIcon name="save" /> {phase === "saving" ? "Saving…" : `Save ${toSave.length}`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
