"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AssistantChatTurn } from "@/types";

type ApiError = { error?: { message?: string } };

/** Example questions: one tap sends them. Each maps to one or two read-only tools. */
const SUGGESTIONS = [
  "How were sales today?",
  "Compare today with yesterday",
  "Top 5 dishes this week",
  "Which dishes haven't sold in 2 weeks?",
  "Show active orders",
];

/** Kept in the browser only; the server re-caps and sanitises whatever is sent. */
const MAX_TURNS_KEPT = 20;

function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return (
    <span className={cn("material-symbols-outlined", className)} style={{ fontSize: size }} aria-hidden="true">
      {name}
    </span>
  );
}

/**
 * Dashboard "Ask AI" (T36): the owner asks about their own restaurant in
 * plain words. Read-only — the assistant can look up sales, orders and dishes
 * but can't change anything. Talks to POST /api/ai/owner-chat.
 */
export function OwnerAssistantChat({ enabled }: { enabled: boolean }) {
  const [turns, setTurns] = useState<AssistantChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, pending]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || pending) return;
    const next: AssistantChatTurn[] = [...turns, { role: "user" as const, content: text }].slice(-MAX_TURNS_KEPT);
    setTurns(next);
    setInput("");
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/ai/owner-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const json = (await res.json()) as ApiError & { reply?: string };
      if (!res.ok || !json.reply) {
        setError(json.error?.message ?? "The assistant couldn't answer. Try again.");
        return;
      }
      const reply = json.reply;
      setTurns((prev) => [...prev, { role: "assistant" as const, content: reply }].slice(-MAX_TURNS_KEPT));
    } catch (err) {
      console.error("[owner-chat] request failed", err);
      setError("Network error. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  function retry() {
    const lastUser = [...turns].reverse().find((t) => t.role === "user");
    if (!lastUser) return;
    // Drop the unanswered question and ask it again.
    setTurns((prev) => prev.slice(0, prev.lastIndexOf(lastUser)));
    void ask(lastUser.content);
  }

  if (!enabled) {
    return (
      <div className="m-margin-mobile rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 text-center md:m-5">
        <Icon name="smart_toy" size={28} className="text-on-surface-variant" />
        <p className="mt-2 font-display text-title text-on-surface">Ask AI is turned off</p>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Your Sales reports page still shows revenue, orders and trends.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-margin-mobile pb-4 md:px-5">
      {/* Conversation */}
      <div className="flex flex-1 flex-col gap-3 py-4" aria-live="polite">
        {turns.length === 0 && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 text-center sm:p-8">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-brand-border bg-brand-subtle text-brand-text">
              <Icon name="auto_awesome" size={28} />
            </span>
            <div>
              <p className="font-display text-title text-on-surface">Ask about your restaurant</p>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                Sales, orders and dishes, in plain words. It can read your data but can&apos;t change anything.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  className="min-h-[44px] rounded-full border border-outline-variant bg-surface-container-lowest px-4 text-sm text-on-surface transition-colors hover:border-brand-border hover:text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-brand-foreground">
                {t.content}
              </p>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand-text">
                <Icon name="auto_awesome" size={16} />
              </span>
              <p className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-surface-container px-4 py-2.5 text-sm text-on-surface">
                {t.content}
              </p>
            </div>
          )
        )}

        {/* Thinking: a skeleton bubble, not a spinner. */}
        {pending && (
          <div className="flex items-start gap-2" aria-busy="true" aria-label="Looking up your data">
            <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand-text">
              <Icon name="auto_awesome" size={16} className="animate-pulse" />
            </span>
            <div className="w-3/4 space-y-2">
              <Skeleton className="h-4 w-1/2 rounded-full" />
              <Skeleton className="h-14 w-full rounded-2xl" />
            </div>
          </div>
        )}

        {error && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-error/30 bg-error-container px-3 py-2 text-sm text-on-error-container" role="alert">
            <Icon name="error" size={18} />
            <span className="flex-1">{error}</span>
            <Button variant="ghost" size="sm" className="h-11" onClick={retry}>
              Try again
            </Button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer: sticks to the bottom of the screen on phones. */}
      <div className="sticky bottom-0 -mx-margin-mobile border-t border-outline-variant bg-surface/95 px-margin-mobile py-3 backdrop-blur md:-mx-5 md:px-5">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            maxLength={500}
            rows={1}
            placeholder="Ask about sales, orders or dishes…"
            aria-label="Your question"
            className="max-h-32 min-h-[44px] flex-1 resize-none py-2.5 text-sm"
          />
          <Button
            variant="brand"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => void ask(input)}
            disabled={pending || !input.trim()}
            aria-label="Send"
          >
            <Icon name="send" />
          </Button>
        </div>
        {turns.length > 0 && (
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-[11px] text-on-surface-variant">Reads your data only. Can&apos;t change anything.</p>
            <Button variant="ghost" size="sm" className="h-11 text-xs" onClick={() => { setTurns([]); setError(""); }} disabled={pending}>
              New chat
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
