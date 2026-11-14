/**
 * Client-safe rules for an AI menu draft. Kept apart from menu-onboarding.ts,
 * which is server-only, so the review dialog can share the exact rule the
 * server applies.
 */
import type { DraftMenuItem } from "@/types";

/** A dish can be saved once it has a price and a food type. */
export function draftItemIsReady(item: Pick<DraftMenuItem, "basePrice" | "foodType">): boolean {
  return item.basePrice !== null && item.basePrice > 0 && item.foodType !== null;
}

/** Most pages (photos or PDFs) one AI menu import accepts. Shared by the dialog and the route. */
export const MAX_IMPORT_PAGES = 5;
