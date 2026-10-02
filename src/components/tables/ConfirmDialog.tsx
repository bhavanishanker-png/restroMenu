"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Tone = "danger" | "warning";

const TONE: Record<Tone, string> = {
  danger: "border-error/25 bg-error-container text-on-error-container",
  warning: "border-warning/40 bg-warning-container text-on-warning-container",
};

/**
 * A confirmation step for destructive actions. Replaces `window.confirm`,
 * which cannot be styled, explains nothing, and is easy to dismiss by reflex.
 * Shared by the tables and staff screens.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  icon,
  tone = "danger",
  title,
  description,
  confirmLabel,
  busyLabel,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: string;
  tone?: Tone;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="gap-5 sm:max-w-md">
        <DialogHeader className="gap-3 space-y-0 text-left sm:text-left">
          <span
            className={cn("grid h-11 w-11 place-items-center rounded-xl border", TONE[tone])}
            aria-hidden="true"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
              {icon}
            </span>
          </span>
          <DialogTitle className="pr-8 font-display text-headline-sm">{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-body-sm text-on-surface-variant">{description}</div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            size="touch"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Keep it
          </Button>
          <Button
            variant="destructive"
            size="touch"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
