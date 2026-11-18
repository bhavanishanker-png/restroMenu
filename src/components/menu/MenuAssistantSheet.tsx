"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { FoodTypeMarker } from "@/components/ui/FoodTypeMarker";
import { formatMoney } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { AssistantReply, AssistantSuggestion, MenuItem, PublicMenu } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menu: PublicMenu;
  token: string;
  /** Opens the normal item sheet. The assistant never adds to the cart itself. */
  onSelectItem: (item: MenuItem) => void;
};

type ChatEntry =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; suggestions: AssistantSuggestion[] };

const MAX_INPUT = 500;

const STARTERS = [
  "Something spicy and veg",
  "What's popular here?",
  "A light meal for one",
  "कुछ मीठा बताइए",
];

export function MenuAssistantSheet({ open, onOpenChange, menu, token, onSelectItem }: Props) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hydratedRef = useRef(false);

  // Persist the conversation per table so it survives leaving the menu (to the
  // cart, checkout, order tracker) and coming back. sessionStorage, not
  // localStorage: it's scoped to this dining session and clears when the tab
  // closes. Keyed by slug + table so a different table never shows stale chat.
  const storageKey = `qbite:menu-chat:${menu.restaurant.slug}:${token}`;
  const MAX_STORED = 50;

  // Suggestions arrive as ids; cards render from the menu the page already
  // has, so names, markers and prices always come from the database.
  const itemsById = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const cat of menu.categories) for (const item of cat.items) map.set(item.id, item);
    return map;
  }, [menu.categories]);

  // Hydrate once on mount. Done in an effect (not a useState initializer) so
  // server and client first render agree — sessionStorage doesn't exist on the
  // server. Wrapped in try/catch: storage can throw in private mode.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatEntry[];
        if (Array.isArray(parsed) && parsed.length > 0) setEntries(parsed);
      }
    } catch {
      /* ignore unreadable storage */
    }
    hydratedRef.current = true;
  }, [storageKey]);

  // Persist on change. Only writes once hydrated and non-empty, so the initial
  // empty render can never clobber a saved conversation.
  useEffect(() => {
    if (!hydratedRef.current || entries.length === 0) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(entries.slice(-MAX_STORED)));
    } catch {
      /* storage full or blocked — the chat still works in memory */
    }
  }, [entries, storageKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries, pending]);

  async function send(text: string) {
    const content = text.trim().slice(0, MAX_INPUT);
    if (!content || pending) return;

    const next: ChatEntry[] = [...entries, { role: "user", content }];
    setEntries(next);
    setInput("");
    setError(null);
    setPending(true);

    try {
      const res = await fetch("/api/ai/menu-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: menu.restaurant.slug,
          token,
          // Text only: suggestions are display state, not conversation.
          messages: next.map((e) => ({ role: e.role, content: e.content })),
        }),
      });
      const json = (await res.json()) as Partial<AssistantReply> & {
        error?: { message?: string };
      };
      if (!res.ok || typeof json.reply !== "string") {
        setError(json.error?.message ?? "The assistant couldn't answer. Try again.");
        // Drop the unanswered question so a retry doesn't send it twice.
        setEntries(entries);
        setInput(content);
        return;
      }
      setEntries([
        ...next,
        { role: "assistant", content: json.reply, suggestions: json.suggestions ?? [] },
      ]);
    } catch (err) {
      console.error("[menu-assistant] request failed", err);
      setError("You seem to be offline. Check your connection and try again.");
      setEntries(entries);
      setInput(content);
    } finally {
      setPending(false);
    }
  }

  function pick(item: MenuItem) {
    onOpenChange(false);
    onSelectItem(item);
  }

  function newChat() {
    setEntries([]);
    setInput("");
    setError(null);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[85svh] flex-col overflow-hidden rounded-t-3xl bg-surface p-0"
      >
        <SheetHeader className="border-b border-outline-variant px-5 pb-3 pt-5 text-left">
          <div className="flex items-start justify-between gap-2">
            <SheetTitle className="flex items-center gap-2 font-display text-headline-sm">
              <span
                className="material-symbols-outlined text-brand-text"
                style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                auto_awesome
              </span>
              Ask about the menu
            </SheetTitle>
            {entries.length > 0 && (
              <button
                type="button"
                onClick={newChat}
                className="mr-7 flex min-h-[44px] shrink-0 items-center gap-1 rounded-full border border-outline-variant px-3 text-body-xs font-semibold text-on-surface-variant transition-colors hover:border-brand-border hover:text-brand-text"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">
                  add_comment
                </span>
                New chat
              </button>
            )}
          </div>
          <SheetDescription className="text-body-sm">
            Tell me what you feel like. I&apos;ll suggest dishes — you choose what to add.
          </SheetDescription>
        </SheetHeader>

        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
          aria-live="polite"
        >
          {entries.length === 0 && (
            <div className="space-y-3">
              <p className="text-body-sm text-on-surface-variant">Try one of these:</p>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="min-h-[44px] rounded-full border border-outline-variant bg-surface-container-lowest px-4 text-sm text-on-surface transition-colors hover:border-brand-border hover:text-brand-text"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {entries.map((entry, i) =>
            entry.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-brand-foreground shadow-level-1">
                  {entry.content}
                </p>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-2">
                <AssistantAvatar />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="inline-block max-w-full whitespace-pre-wrap rounded-2xl rounded-tl-md bg-surface-container px-4 py-2.5 text-sm text-on-surface">
                    {entry.content}
                  </p>
                  {entry.suggestions.length > 0 && (
                    <ul className="space-y-2">
                      {entry.suggestions.map((s) => {
                        const item = itemsById.get(s.itemId);
                        if (!item || !item.isAvailable) return null;
                        return (
                          <li key={s.itemId}>
                            <button
                              type="button"
                              onClick={() => pick(item)}
                              className="group flex min-h-[64px] w-full items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-2.5 text-left shadow-level-1 transition-colors hover:border-brand-border hover:bg-surface-container"
                            >
                              {item.imageUrl ? (
                                <Image
                                  src={item.imageUrl}
                                  alt=""
                                  width={52}
                                  height={52}
                                  className="h-[52px] w-[52px] shrink-0 rounded-xl object-cover"
                                />
                              ) : (
                                <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-xl bg-surface-container text-on-surface-variant">
                                  <span className="material-symbols-outlined" style={{ fontSize: 24 }} aria-hidden="true">restaurant</span>
                                </span>
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <FoodTypeMarker type={item.foodType} />
                                  <span className="truncate font-semibold text-on-surface">{item.name}</span>
                                </span>
                                {s.reason && (
                                  <span className="mt-0.5 line-clamp-2 block text-xs text-on-surface-variant">{s.reason}</span>
                                )}
                              </span>
                              <span className="flex shrink-0 flex-col items-end gap-1">
                                <span className="text-sm font-semibold tabular-nums text-on-surface">
                                  {item.variants.length > 0 && (
                                    <span className="mr-0.5 text-xs font-normal text-on-surface-variant">from</span>
                                  )}
                                  {formatMoney(item.basePrice)}
                                </span>
                                <span className="flex items-center gap-0.5 rounded-full bg-brand-subtle px-2 py-0.5 text-xs font-semibold text-brand-text transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                                  <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden="true">add</span>
                                  Add
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )
          )}

          {/* Skeleton reply while the assistant works, not a spinner. */}
          {pending && (
            <div className="flex items-start gap-2" aria-busy="true" aria-label="Assistant is typing">
              <AssistantAvatar />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-10 w-3/4 rounded-2xl rounded-tl-md" />
                <Skeleton className="h-16 w-full rounded-2xl" />
              </div>
            </div>
          )}

          {error && (
            <p className="flex items-center gap-1.5 rounded-xl border border-error/30 bg-error-container px-3 py-2 text-sm text-on-error-container" role="alert">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden="true">
                error
              </span>
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-outline-variant bg-surface-container-low px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              maxLength={MAX_INPUT}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="e.g. something spicy under 300"
              aria-label="Ask about the menu"
              className="h-11 min-w-0 flex-1 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 text-base text-on-surface placeholder:text-on-surface-variant/70"
            />
            <button
              type="button"
              onClick={() => send(input)}
              disabled={pending || input.trim().length === 0}
              aria-label="Send"
              className={cn(
                "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-brand-foreground transition-opacity",
                (pending || input.trim().length === 0) && "opacity-50"
              )}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }} aria-hidden="true">
                send
              </span>
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-on-surface-variant">
            AI suggestions can be wrong. Prices shown come from the menu. Allergies? Please ask the staff.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Small sparkle avatar marking an assistant turn, so the chat reads as a conversation. */
function AssistantAvatar() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand-text"
    >
      <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>
        auto_awesome
      </span>
    </span>
  );
}
