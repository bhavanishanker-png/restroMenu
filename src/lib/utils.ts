import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The type scale defined in tailwind.config.ts (theme.extend.fontSize).
 * Keep in sync when adding a size there.
 */
const FONT_SIZES = [
  "display-2xl",
  "display-xl",
  "display-lg",
  "display",
  "headline-lg",
  "headline-lg-mobile",
  "headline-md",
  "headline-sm",
  "title",
  "body-lg",
  "body-md",
  "body-sm",
  "body-xs",
  "label",
  "label-bold",
] as const;

/**
 * tailwind-merge only knows Tailwind's built-in sizes, so it read
 * `text-body-sm` as a text *colour* — and `cn("text-body-sm", "text-error")`
 * silently dropped the size, leaving that text at the inherited size.
 * Registering the scale puts these in the font-size group, where they no
 * longer conflict with colours (and still override each other correctly).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...FONT_SIZES] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
