"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Light is the default, and `enableSystem` is deliberately off: the OS
 * preference would otherwise hand dark mode to anyone whose machine is set
 * that way, which is not what "starts in light mode" means. The choice is
 * still the user's — it just starts light and persists once they pick.
 *
 * This must stay in step with globals.css, where the light values live in
 * `:root`. If one says light and the other says dark, the page paints the
 * wrong theme for a frame before hydration.
 *
 * `disableTransitionOnChange` stops every colour transition in the app from
 * firing at once during a theme flip, which otherwise looks like a smear.
 *
 * This component deliberately imports nothing from framer-motion. It lives in
 * the root layout, so a `<MotionConfig>` here pulled the whole animation
 * library into the shared bundle for every route — including the customer
 * menu and the kitchen display, neither of which animates with it. Reduced
 * motion is handled inside the reveal components instead (and globally for CSS
 * animations by the media query in globals.css).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
