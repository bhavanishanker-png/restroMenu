import type { Config } from "tailwindcss";

/**
 * Every colour resolves to a CSS variable declared in `src/app/globals.css`.
 * Nothing here is a literal hex — that is what makes the whole app theme-aware:
 * the same `bg-surface-container-lowest` is #111113 in dark and #FFFFFF in light.
 *
 * The `hsl(var(--x) / <alpha-value>)` form is required, not optional — without
 * it Tailwind's opacity modifiers (`border-outline-variant/30`) silently break.
 */
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // Shared class maps live here (e.g. lib/order-status.ts); without this glob
    // their classes are never scanned and compile to nothing.
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ── Border radius ──────────────────────────────────────────────────────
      // One language: 6px controls → 10px inputs → 14px cards → 18px containers.
      borderRadius: {
        sm:      "calc(var(--radius) - 4px)", //  6px
        DEFAULT: "var(--radius)",             // 10px
        md:      "calc(var(--radius) + 2px)", // 12px
        lg:      "calc(var(--radius) + 4px)", // 14px  ← components
        xl:      "calc(var(--radius) + 8px)", // 18px  ← cards
        "2xl":   "calc(var(--radius) + 14px)",// 24px  ← containers, sheets
        "3xl":   "calc(var(--radius) + 22px)",// 32px  ← hero panels
        full:    "9999px",
      },

      // ── Colours ────────────────────────────────────────────────────────────
      colors: {
        // shadcn primitives
        background:  token("background"),
        foreground:  token("foreground"),
        card:        { DEFAULT: token("card"), foreground: token("card-foreground") },
        popover:     { DEFAULT: token("popover"), foreground: token("popover-foreground") },
        primary:     { DEFAULT: token("primary"), foreground: token("primary-foreground") },
        secondary:   { DEFAULT: token("secondary"), foreground: token("secondary-foreground") },
        muted:       { DEFAULT: token("muted"), foreground: token("muted-foreground") },
        accent:      { DEFAULT: token("accent"), foreground: token("accent-foreground") },
        destructive: { DEFAULT: token("destructive"), foreground: token("destructive-foreground") },
        border: token("border"),
        input:  token("input"),
        ring:   token("ring"),

        // The one accent. Reserved for CTAs, focus, active state, highlights.
        brand: {
          DEFAULT:    token("brand"),
          foreground: token("brand-foreground"),
          text:       token("brand-text"),   // brand used AS text on the page
          subtle:     token("brand-subtle"), // tinted surface
          border:     token("brand-border"),
        },

        chart: {
          "1": token("chart-1"),
          "2": token("chart-2"),
          "3": token("chart-3"),
          "4": token("chart-4"),
          "5": token("chart-5"),
        },

        // ── Surfaces ─────────────────────────────────────────────────────────
        "surface":                    token("surface"),
        "surface-dim":                token("surface-dim"),
        "surface-bright":             token("surface-bright"),
        "surface-container-lowest":   token("surface-container-lowest"),
        "surface-container-low":      token("surface-container-low"),
        "surface-container":          token("surface-container"),
        "surface-container-high":     token("surface-container-high"),
        "surface-container-highest":  token("surface-container-highest"),
        "surface-variant":            token("surface-variant"),
        "on-surface":                 token("on-surface"),
        "on-surface-variant":         token("on-surface-variant"),
        "inverse-surface":            token("inverse-surface"),
        "inverse-on-surface":         token("inverse-on-surface"),
        "outline":                    token("outline"),
        "outline-variant":            token("outline-variant"),
        "surface-tint":               token("surface-tint"),

        "on-primary":                 token("on-primary"),
        "primary-container":          token("primary-container"),
        "on-primary-container":       token("on-primary-container"),
        "inverse-primary":            token("inverse-primary"),
        "primary-fixed":              token("primary-fixed"),
        "primary-fixed-dim":          token("primary-fixed-dim"),
        "on-primary-fixed":           token("on-primary-fixed"),
        "on-primary-fixed-variant":   token("on-primary-fixed-variant"),

        "on-secondary":               token("on-secondary"),
        "secondary-container":        token("secondary-container"),
        "on-secondary-container":     token("on-secondary-container"),
        "secondary-fixed":            token("secondary-fixed"),
        "secondary-fixed-dim":        token("secondary-fixed-dim"),
        "on-secondary-fixed":         token("on-secondary-fixed"),
        "on-secondary-fixed-variant": token("on-secondary-fixed-variant"),

        // ── Semantic — hue only where it carries meaning ──────────────────────
        "tertiary":                   token("tertiary"),
        "on-tertiary":                token("on-tertiary"),
        "tertiary-container":         token("tertiary-container"),
        "on-tertiary-container":      token("on-tertiary-container"),
        "tertiary-fixed":             token("tertiary-fixed"),
        "tertiary-fixed-dim":         token("tertiary-fixed-dim"),
        "on-tertiary-fixed":          token("on-tertiary-fixed"),
        "on-tertiary-fixed-variant":  token("on-tertiary-fixed-variant"),
        "error":                      token("error"),
        "on-error":                   token("on-error"),
        "error-container":            token("error-container"),
        "on-error-container":         token("on-error-container"),
        "success":                    token("success"),
        "on-success":                 token("on-success"),
        "success-container":          token("success-container"),
        "on-success-container":       token("on-success-container"),
        "warning":                    token("warning"),
        "on-warning":                 token("on-warning"),
        "warning-container":          token("warning-container"),
        "on-warning-container":       token("on-warning-container"),
        // FSSAI food-type markers — always paired with a shape, never colour alone.
        "veg":                        token("veg"),
        "non-veg":                    token("non-veg"),
        "egg":                        token("egg"),
      },

      // ── Typography ─────────────────────────────────────────────────────────
      // Space Grotesk for display, Inter for body, JetBrains Mono for figures
      // that must not jitter (order numbers, join codes). Declared as next/font
      // CSS variables on <html> in layout.tsx.
      fontFamily: {
        sans:    ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono:    ["var(--font-mono)", "ui-monospace", "monospace"],

        // Legacy aliases — the app addresses fonts by role in ~120 files.
        "headline-lg":        ["var(--font-display)", "sans-serif"],
        "headline-lg-mobile": ["var(--font-display)", "sans-serif"],
        "headline-md":        ["var(--font-display)", "sans-serif"],
        "headline-sm":        ["var(--font-display)", "sans-serif"],
        "body-lg":            ["var(--font-sans)", "sans-serif"],
        "body-md":            ["var(--font-sans)", "sans-serif"],
        "body-sm":            ["var(--font-sans)", "sans-serif"],
        "label-bold":         ["var(--font-sans)", "sans-serif"],
      },

      // A proper scale. Tighter tracking as size grows — large text set at
      // default tracking always reads loose and amateurish.
      fontSize: {
        "display-2xl":        ["clamp(3rem, 1.6rem + 6vw, 5.5rem)",   { lineHeight: "0.95", letterSpacing: "-0.045em", fontWeight: "700" }],
        "display-xl":         ["clamp(2.25rem, 1.5rem + 3.4vw, 3.75rem)", { lineHeight: "1.0",  letterSpacing: "-0.04em",  fontWeight: "700" }],
        "display-lg":         ["clamp(2rem, 1.3rem + 3vw, 3.25rem)",  { lineHeight: "1.06", letterSpacing: "-0.035em", fontWeight: "700" }],
        "display":            ["clamp(1.875rem, 1.3rem + 2.4vw, 3rem)", { lineHeight: "1.1",  letterSpacing: "-0.03em",  fontWeight: "700" }],
        "headline-lg":        ["clamp(1.5rem, 1.2rem + 1.2vw, 2rem)", { lineHeight: "1.2",  letterSpacing: "-0.022em", fontWeight: "600" }],
        "headline-lg-mobile": ["1.75rem", { lineHeight: "1.2",  letterSpacing: "-0.022em", fontWeight: "600" }],
        "headline-md":        ["1.5rem",  { lineHeight: "1.28", letterSpacing: "-0.018em", fontWeight: "600" }],
        "headline-sm":        ["1.25rem", { lineHeight: "1.35", letterSpacing: "-0.014em", fontWeight: "600" }],
        "title":              ["1.0625rem", { lineHeight: "1.4", letterSpacing: "-0.011em", fontWeight: "600" }],
        "body-lg":            ["1.125rem", { lineHeight: "1.65", letterSpacing: "-0.005em", fontWeight: "400" }],
        "body-md":            ["1rem",     { lineHeight: "1.6",  letterSpacing: "0",        fontWeight: "400" }],
        "body-sm":            ["0.875rem", { lineHeight: "1.55", letterSpacing: "0.001em",  fontWeight: "400" }],
        "body-xs":            ["0.8125rem",{ lineHeight: "1.5",  letterSpacing: "0.002em",  fontWeight: "400" }],
        "label":              ["0.8125rem",{ lineHeight: "1.2",  letterSpacing: "0.005em",  fontWeight: "500" }],
        "label-bold":         ["0.75rem",  { lineHeight: "1.33", letterSpacing: "0.055em",  fontWeight: "600" }],
      },

      // ── Spacing ────────────────────────────────────────────────────────────
      // 4px base. The short names are load-bearing across the app; the section
      // rhythm tokens are new and used by the rebuilt marketing surfaces.
      spacing: {
        "xs":             "4px",
        "base":           "8px",
        "sm":             "12px",
        "md":             "24px",
        "lg":             "40px",
        "xl":             "64px",
        "2xl":            "96px",
        "3xl":            "128px",
        "gutter":         "16px",
        "margin-mobile":  "20px",
        "margin-desktop": "48px",
        "section":        "clamp(4rem, 2rem + 8vw, 8rem)",
      },

      maxWidth: {
        content: "1200px",
        prose:   "68ch",
      },

      // ── Elevation ──────────────────────────────────────────────────────────
      // Per-theme values live in globals.css, so a card is lifted by shadow on
      // white and by a lighter surface plus inset highlight on black.
      boxShadow: {
        "level-1": "var(--shadow-1)",
        "level-2": "var(--shadow-2)",
        "level-3": "var(--shadow-3)",
        "glow":    "var(--glow)",
        "glow-lg": "var(--glow-lg)",
      },

      // ── Motion ─────────────────────────────────────────────────────────────
      transitionTimingFunction: {
        "out-expo":  "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-quart": "cubic-bezier(0.25, 1, 0.5, 1)",
        "spring":    "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "220ms",
        slow: "380ms",
      },

      keyframes: {
        "slide-in": {
          from: { opacity: "0", transform: "translateY(-16px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        // Entrance for the floating cart bar — CSS so the customer menu ships
        // no animation library.
        "slide-up": {
          from: { opacity: "0", transform: "translateY(120%)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        // Slow drift for hero aurora blobs.
        "aurora": {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%":      { transform: "translate3d(4%, -6%, 0) scale(1.12)" },
        },
        // Marquee for the logo strip. Halved translate because the track is
        // rendered twice back-to-back for a seamless loop.
        "marquee": {
          from: { transform: "translateX(0)" },
          to:   { transform: "translateX(-50%)" },
        },
        "pulse-ring": {
          "0%":   { boxShadow: "0 0 0 0 hsl(var(--brand) / 0.5)" },
          "70%":  { boxShadow: "0 0 0 10px hsl(var(--brand) / 0)" },
          "100%": { boxShadow: "0 0 0 0 hsl(var(--brand) / 0)" },
        },
      },
      animation: {
        "slide-in":   "slide-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-up":    "fade-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-in":    "fade-in 0.3s ease-out forwards",
        "slide-up":   "slide-up 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "aurora":     "aurora 18s ease-in-out infinite",
        "marquee":    "marquee 42s linear infinite",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
