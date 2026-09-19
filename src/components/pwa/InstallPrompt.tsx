"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!prompt || dismissed) return null;

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted" || outcome === "dismissed") {
      setPrompt(null);
      setDismissed(true);
    }
  }

  return (
    <div className="mx-4 mt-4 flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container px-4 py-3">
      <Download className="h-5 w-5 shrink-0 text-on-surface" />
      <div className="flex-1">
        <p className="text-sm font-medium text-on-surface">Add QBite to your home screen</p>
        <p className="text-xs text-on-surface-variant">Order faster next time.</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={install} className="bg-on-surface hover:bg-primary-container text-surface-container-lowest h-8 text-xs">
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)} className="h-8 text-xs text-on-surface-variant">
          Not now
        </Button>
      </div>
    </div>
  );
}
