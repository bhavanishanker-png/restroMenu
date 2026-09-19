"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Dark is the default, and `enableSystem` is deliberately off: the OS
 * preference would otherwise override it and hand light mode to most users,
 * which is not what "dark by default" means. The choice is still the user's —
 * it just starts dark and persists once they pick.
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
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
