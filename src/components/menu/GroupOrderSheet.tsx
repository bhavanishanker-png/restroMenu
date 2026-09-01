"use client";

import { useState } from "react";
import { useCartStore } from "@/store/cart";

type View = "main" | "start-name" | "start-code" | "join-code" | "join-name";

type Props = {
  slug: string;
  token: string;
  onClose: () => void;
};

export function GroupOrderSheet({ slug, token, onClose }: Props) {
  const [view, setView] = useState<View>("main");
  const [personName, setPersonName] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resolvedSession, setResolvedSession] = useState<{ sessionId: string; tableLabel: string | null } | null>(null);

  const sessionId = useCartStore((s) => s.sessionId);
  const joinCode = useCartStore((s) => s.joinCode);
  const storedPersonName = useCartStore((s) => s.personName);
  const joinGroup = useCartStore((s) => s.joinGroup);
  const leaveGroup = useCartStore((s) => s.leaveGroup);

  // Already in a group — show the current session info
  if (sessionId && joinCode) {
    return (
      <div className="flex flex-col items-center gap-6 px-6 py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary-container">
          <span className="material-symbols-outlined text-on-secondary-container" style={{ fontSize: 32, fontVariationSettings: "'FILL' 1" }}>
            group
          </span>
        </div>
        <div>
          <p className="font-headline-sm text-on-surface" style={{ fontSize: 20 }}>
            Group Order Active
          </p>
          <p className="font-body-md text-on-surface-variant mt-1">
            Ordering as <strong className="text-on-surface">{storedPersonName}</strong>
          </p>
        </div>

        <div className="w-full rounded-2xl bg-surface-container p-5 border border-outline-variant/30">
          <p className="font-label-bold text-on-surface-variant text-xs uppercase tracking-widest mb-2">
            Share this code with your table
          </p>
          <p className="font-mono font-bold text-on-surface tracking-[0.3em]" style={{ fontSize: 36 }}>
            {joinCode}
          </p>
          <p className="font-body-sm text-on-surface-variant mt-2" style={{ fontSize: 13 }}>
            Others can tap &ldquo;Join Group Order&rdquo; and enter this code.
          </p>
        </div>

        <button
          onClick={() => { leaveGroup(); onClose(); }}
          className="font-body-sm text-error underline"
          style={{ fontSize: 14 }}
        >
          Leave group order
        </button>

        <button
          onClick={onClose}
          className="w-full h-12 rounded-xl bg-primary text-on-primary font-headline-sm"
          style={{ fontSize: 16 }}
        >
          Back to menu
        </button>
      </div>
    );
  }

  // Start: enter your name
  if (view === "start-name") {
    return (
      <div className="flex flex-col gap-5 px-6 py-8">
        <button onClick={() => setView("main")} className="self-start flex items-center gap-1 text-on-surface-variant font-body-sm">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          Back
        </button>
        <div>
          <p className="font-headline-sm text-on-surface" style={{ fontSize: 20 }}>
            What&apos;s your name?
          </p>
          <p className="font-body-md text-on-surface-variant mt-1">
            Your items will be tagged with your name for the split bill.
          </p>
        </div>

        <input
          type="text"
          placeholder="e.g. Alice"
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          autoFocus
          className="w-full h-12 rounded-lg border border-outline-variant bg-surface-container px-4 font-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
        {error && <p className="font-body-sm text-error">{error}</p>}

        <button
          onClick={async () => {
            if (!personName.trim()) { setError("Please enter your name."); return; }
            setError("");
            setLoading(true);
            try {
              const res = await fetch("/api/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ restaurantSlug: slug, tableToken: token }),
              });
              const json = await res.json() as { sessionId?: string; joinCode?: string; tableLabel?: string; error?: { message: string } };
              if (!res.ok || !json.sessionId || !json.joinCode) {
                setError(json.error?.message ?? "Failed to start group order.");
                return;
              }
              setGeneratedCode(json.joinCode);
              setResolvedSession({ sessionId: json.sessionId, tableLabel: json.tableLabel ?? null });
              setView("start-code");
            } catch {
              setError("Network error. Please try again.");
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          className="w-full h-12 rounded-xl bg-primary text-on-primary font-headline-sm disabled:opacity-60"
          style={{ fontSize: 16 }}
        >
          {loading ? "Starting…" : "Start Group Order"}
        </button>
      </div>
    );
  }

  // Start: show the generated code + confirm
  if (view === "start-code" && resolvedSession) {
    return (
      <div className="flex flex-col items-center gap-6 px-6 py-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary-container">
          <span className="material-symbols-outlined text-on-secondary-container" style={{ fontSize: 28, fontVariationSettings: "'FILL' 1" }}>
            celebration
          </span>
        </div>
        <div>
          <p className="font-headline-sm text-on-surface" style={{ fontSize: 20 }}>Group order started!</p>
          <p className="font-body-md text-on-surface-variant mt-1">
            Share this code with your table.
          </p>
        </div>

        <div className="w-full rounded-2xl bg-surface-container p-5 border border-outline-variant/30">
          <p className="font-label-bold text-on-surface-variant text-xs uppercase tracking-widest mb-2">
            Join Code
          </p>
          <p className="font-mono font-bold text-on-surface tracking-[0.3em]" style={{ fontSize: 36 }}>
            {generatedCode}
          </p>
        </div>

        <button
          onClick={() => {
            joinGroup(resolvedSession.sessionId, generatedCode, personName.trim());
            onClose();
          }}
          className="w-full h-12 rounded-xl bg-primary text-on-primary font-headline-sm"
          style={{ fontSize: 16 }}
        >
          Start ordering
        </button>
      </div>
    );
  }

  // Join: enter the code
  if (view === "join-code") {
    return (
      <div className="flex flex-col gap-5 px-6 py-8">
        <button onClick={() => setView("main")} className="self-start flex items-center gap-1 text-on-surface-variant font-body-sm">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          Back
        </button>
        <div>
          <p className="font-headline-sm text-on-surface" style={{ fontSize: 20 }}>Enter join code</p>
          <p className="font-body-md text-on-surface-variant mt-1">
            Ask the person who started the group order for the 6-digit code.
          </p>
        </div>

        <input
          type="text"
          inputMode="numeric"
          placeholder="e.g. 482917"
          value={joinCodeInput}
          maxLength={6}
          onChange={(e) => setJoinCodeInput(e.target.value.replace(/\D/g, ""))}
          autoFocus
          className="w-full h-12 rounded-lg border border-outline-variant bg-surface-container px-4 font-mono text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary tracking-widest"
          style={{ fontSize: 22, letterSpacing: "0.2em" }}
        />
        {error && <p className="font-body-sm text-error">{error}</p>}

        <button
          onClick={async () => {
            if (joinCodeInput.length !== 6) { setError("Please enter the full 6-digit code."); return; }
            setError("");
            setLoading(true);
            try {
              const res = await fetch(`/api/sessions/${joinCodeInput}`);
              const json = await res.json() as { sessionId?: string; joinCode?: string; tableLabel?: string | null; error?: { message: string } };
              if (!res.ok || !json.sessionId) {
                setError(json.error?.message ?? "Session not found. Check the code and try again.");
                return;
              }
              setResolvedSession({ sessionId: json.sessionId, tableLabel: json.tableLabel ?? null });
              setView("join-name");
            } catch {
              setError("Network error. Please try again.");
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading || joinCodeInput.length !== 6}
          className="w-full h-12 rounded-xl bg-primary text-on-primary font-headline-sm disabled:opacity-60"
          style={{ fontSize: 16 }}
        >
          {loading ? "Looking up…" : "Find Group Order"}
        </button>
      </div>
    );
  }

  // Join: enter name after finding the session
  if (view === "join-name" && resolvedSession) {
    return (
      <div className="flex flex-col gap-5 px-6 py-8">
        <div className="rounded-xl bg-secondary-container/40 px-4 py-3 flex items-center gap-3">
          <span className="material-symbols-outlined text-secondary" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>
            table_restaurant
          </span>
          <p className="font-body-md text-on-surface">
            {resolvedSession.tableLabel ? `Table ${resolvedSession.tableLabel}` : "Group order found"}
          </p>
        </div>

        <div>
          <p className="font-headline-sm text-on-surface" style={{ fontSize: 20 }}>What&apos;s your name?</p>
          <p className="font-body-md text-on-surface-variant mt-1">
            Your items will appear separately in the bill.
          </p>
        </div>

        <input
          type="text"
          placeholder="e.g. Bob"
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          autoFocus
          className="w-full h-12 rounded-lg border border-outline-variant bg-surface-container px-4 font-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
        {error && <p className="font-body-sm text-error">{error}</p>}

        <button
          onClick={() => {
            if (!personName.trim()) { setError("Please enter your name."); return; }
            joinGroup(resolvedSession.sessionId, joinCodeInput, personName.trim());
            onClose();
          }}
          className="w-full h-12 rounded-xl bg-primary text-on-primary font-headline-sm"
          style={{ fontSize: 16 }}
        >
          Join Group Order
        </button>
      </div>
    );
  }

  // Main view
  return (
    <div className="flex flex-col gap-4 px-6 py-8">
      <div className="text-center mb-2">
        <p className="font-headline-sm text-on-surface" style={{ fontSize: 20 }}>Group Order</p>
        <p className="font-body-md text-on-surface-variant mt-1">
          Order together and split the bill by person.
        </p>
      </div>

      <button
        onClick={() => setView("start-name")}
        className="w-full flex items-center gap-4 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 text-left hover:bg-surface-container transition-colors shadow-level-1"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-container shrink-0">
          <span className="material-symbols-outlined text-on-primary-container" style={{ fontSize: 24, fontVariationSettings: "'FILL' 1" }}>
            add_circle
          </span>
        </div>
        <div>
          <p className="font-headline-sm text-on-surface" style={{ fontSize: 16 }}>Start Group Order</p>
          <p className="font-body-sm text-on-surface-variant" style={{ fontSize: 13 }}>
            Create a shared session and share the code
          </p>
        </div>
      </button>

      <button
        onClick={() => setView("join-code")}
        className="w-full flex items-center gap-4 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 text-left hover:bg-surface-container transition-colors shadow-level-1"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-container shrink-0">
          <span className="material-symbols-outlined text-on-secondary-container" style={{ fontSize: 24, fontVariationSettings: "'FILL' 1" }}>
            group_add
          </span>
        </div>
        <div>
          <p className="font-headline-sm text-on-surface" style={{ fontSize: 16 }}>Join Group Order</p>
          <p className="font-body-sm text-on-surface-variant" style={{ fontSize: 13 }}>
            Enter the 6-digit code from a tablemate
          </p>
        </div>
      </button>

      <button
        onClick={onClose}
        className="w-full h-12 rounded-xl border border-outline-variant text-on-surface font-headline-sm mt-2"
        style={{ fontSize: 16 }}
      >
        Cancel
      </button>
    </div>
  );
}
