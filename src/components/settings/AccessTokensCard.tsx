"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/tables/ConfirmDialog";
import type { AccessToken } from "@/types";
import { AI_ACCESS_SECTION_ID } from "./section-ids";

type ApiError = { error?: { message?: string } };

function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className ?? ""}`} style={{ fontSize: size }} aria-hidden="true">
      {name}
    </span>
  );
}

function when(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/** Copy-to-clipboard block. Text is selectable too, for browsers without clipboard access. */
function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[access-tokens] copy failed", err);
    }
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-on-surface-variant">{label}</p>
        <Button variant="ghost" size="sm" className="h-11" onClick={copy}>
          <Icon name={copied ? "check" : "content_copy"} /> {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-outline-variant bg-surface-container-low p-2 font-mono text-[11px] text-on-surface">
        {text}
      </pre>
    </div>
  );
}

/**
 * Settings → AI access. Personal access tokens for the owner MCP server (T35):
 * connect Claude Desktop or Claude Code and ask about sales, orders and dishes.
 * Read-only. The token is shown once, right after it is created.
 */
export function AccessTokensCard() {
  const [tokens, setTokens] = useState<AccessToken[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null);
  const [revoking, setRevoking] = useState<AccessToken | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/settings/access-tokens");
      const json = (await res.json()) as ApiError & { tokens?: AccessToken[] };
      if (!res.ok || !json.tokens) throw new Error(json.error?.message ?? "Failed to load tokens.");
      setTokens(json.tokens);
    } catch (err) {
      console.error("[access-tokens] load failed", err);
      setLoadError("Couldn't load your access tokens. Refresh to try again.");
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, [load]);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/settings/access-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = (await res.json()) as ApiError & { token?: string; accessToken?: AccessToken };
      if (!res.ok || !json.token) {
        setCreateError(json.error?.message ?? "Couldn't create the token.");
        return;
      }
      setCreated({ token: json.token, name: name.trim() });
      setName("");
      await load();
    } catch (err) {
      console.error("[access-tokens] create failed", err);
      setCreateError("Network error. Try again.");
    } finally {
      setCreating(false);
    }
  }

  async function revoke() {
    if (!revoking) return;
    setRevokeBusy(true);
    try {
      const res = await fetch(`/api/settings/access-tokens/${revoking.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json()) as ApiError;
        setLoadError(json.error?.message ?? "Couldn't revoke the token.");
      }
      setRevoking(null);
      await load();
    } catch (err) {
      console.error("[access-tokens] revoke failed", err);
      setLoadError("Network error. Try again.");
    } finally {
      setRevokeBusy(false);
    }
  }

  const mcpUrl = `${origin}/api/mcp`;
  const active = tokens?.filter((t) => !t.revokedAt) ?? [];
  const revoked = tokens?.filter((t) => t.revokedAt) ?? [];

  return (
    <section
      id={AI_ACCESS_SECTION_ID}
      aria-labelledby="ai-access-title"
      // Same card as the other Settings sections; scroll-mt clears the top when jumped to.
      className="scroll-mt-6 overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-level-1"
    >
      <header className="flex items-start gap-3 border-b border-outline-variant bg-surface-container-low px-4 py-4 sm:px-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface-variant">
          <Icon name="smart_toy" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="ai-access-title" className="font-display text-title text-on-surface">AI access (MCP)</h2>
          <p className="mt-0.5 text-body-sm text-on-surface-variant">
            Connect Claude Desktop or Claude Code and ask things like &ldquo;How were sales today?&rdquo;. Read-only: it can&apos;t change your menu or orders.
          </p>
        </div>
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        {/* New token, shown once */}
        {created && (
          <div className="space-y-3 rounded-xl border border-success/30 bg-success-container/40 p-3" role="status">
            <p className="flex items-center gap-1 text-sm font-semibold text-on-success-container">
              <Icon name="key" /> &ldquo;{created.name}&rdquo; created. Copy it now: it won&apos;t be shown again.
            </p>
            <CopyBlock label="Access token" text={created.token} />
            <CopyBlock
              label="Claude Code: run in a terminal"
              text={`claude mcp add --transport http qbite ${mcpUrl} --header "Authorization: Bearer ${created.token}"`}
            />
            <CopyBlock
              label="Claude Desktop: add to claude_desktop_config.json"
              text={JSON.stringify(
                {
                  mcpServers: {
                    qbite: {
                      command: "npx",
                      args: ["-y", "mcp-remote", mcpUrl, "--header", "Authorization:${QBITE_AUTH}"],
                      env: { QBITE_AUTH: `Bearer ${created.token}` },
                    },
                  },
                },
                null,
                2
              )}
            />
            <Button variant="ghost" size="sm" className="h-11" onClick={() => setCreated(null)}>
              I&apos;ve saved it
            </Button>
          </div>
        )}

        {/* Create */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1 space-y-1">
            <span className="text-xs font-semibold text-on-surface-variant">Token name</span>
            <Input
              value={name}
              maxLength={60}
              placeholder="e.g. My laptop, Claude Desktop"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create();
              }}
              className="h-11"
            />
          </label>
          <Button variant="brand" size="touch" onClick={create} disabled={creating || !name.trim()}>
            <Icon name="add" /> {creating ? "Creating…" : "Create token"}
          </Button>
        </div>
        {createError && <p className="text-xs text-on-error-container" role="alert">{createError}</p>}

        {/* List */}
        {loadError && <p className="text-xs text-on-error-container" role="alert">{loadError}</p>}
        {!tokens && !loadError && (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        )}
        {tokens && active.length === 0 && (
          <div className="rounded-xl border border-dashed border-outline-variant p-5 text-center text-sm text-on-surface-variant">
            No active tokens. Create one above to connect Claude to your restaurant.
          </div>
        )}
        {active.length > 0 && (
          <ul className="divide-y divide-outline-variant overflow-hidden rounded-xl border border-outline-variant">
            {active.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <Icon name="key" className="shrink-0 text-on-surface-variant" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-on-surface">{t.name}</p>
                  <p className="truncate text-xs text-on-surface-variant">
                    <span className="font-mono">{t.prefix}…</span> · by {t.createdBy.name ?? "staff"} · last used {when(t.lastUsedAt)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="h-11 text-on-error-container" onClick={() => setRevoking(t)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
        {revoked.length > 0 && (
          <p className="text-xs text-on-surface-variant">
            {revoked.length} revoked {revoked.length === 1 ? "token" : "tokens"} (kept for the record).
          </p>
        )}
      </div>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        icon="key_off"
        title={`Revoke "${revoking?.name ?? ""}"?`}
        description="Any Claude app using this token stops working on its next request. This can't be undone."
        confirmLabel="Revoke token"
        busyLabel="Revoking…"
        busy={revokeBusy}
        onConfirm={revoke}
      />
    </section>
  );
}
