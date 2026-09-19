import type { Config } from "tailwindcss";

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
      borderRadius: {
        sm:      "calc(var(--radius) - 4px)", // 4px
        DEFAULT: "var(--radius)",              // 8px
        md:      "calc(var(--radius) + 2px)", // 10px
        lg:      "calc(var(--radius) + 4px)", // 12px  ← components
        xl:      "calc(var(--radius) + 8px)", // 16px  ← containers/cards
        "2xl":   "1.5rem",                    // 24px
        full:    "9999px",                    // pills / badges
      },

      // ── Colors ─────────────────────────────────────────────────────────────
      colors: {
        // shadcn CSS-variable tokens (kept for backward compat with all ui/*)
        background:  "hsl(var(--background))",
        foreground:  "hsl(var(--foreground))",
        card:        { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover:     { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        primary:     { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary:   { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted:       { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent:      { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        border: "hsl(var(--border))",
        input:  "hsl(var(--input))",
        ring:   "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },

        // ── Monochrome design tokens (warm stone ramp) ───────────────────────
        // Hierarchy comes from layering + hairline borders, not hue.
        // Page #FAFAF9 → card #FFFFFF → border #E7E5E4 → ink #1C1917.
        "surface":                    "#fafaf9",
        "surface-dim":                "#f0efee",
        "surface-bright":             "#ffffff",
        "surface-container-lowest":   "#ffffff",
        "surface-container-low":      "#fafaf9",
        "surface-container":          "#f5f5f4",
        "surface-container-high":     "#edebe9",
        "surface-container-highest":  "#e7e5e4",
        "surface-variant":            "#f5f5f4",
        "on-surface":                 "#1c1917",
        "on-surface-variant":         "#57534e",
        "inverse-surface":            "#292524",
        "inverse-on-surface":         "#fafaf9",
        "outline":                    "#a8a29e",
        "outline-variant":            "#e7e5e4",
        "surface-tint":               "#1c1917",
        "on-primary":                 "#ffffff",
        "primary-container":          "#292524",
        "on-primary-container":       "#ffffff",
        "inverse-primary":            "#e7e5e4",
        "primary-fixed":              "#f5f5f4",
        "primary-fixed-dim":          "#e7e5e4",
        "on-primary-fixed":           "#1c1917",
        "on-primary-fixed-variant":   "#44403c",
        "on-secondary":               "#ffffff",
        "secondary-container":        "#e7e5e4",
        "on-secondary-container":     "#44403c",
        "secondary-fixed":            "#f5f5f4",
        "secondary-fixed-dim":        "#d6d3d1",
        "on-secondary-fixed":         "#1c1917",
        "on-secondary-fixed-variant": "#44403c",

        // ── Semantic accents — the only hues that survive ────────────────────
        // Reserved for meaning: danger, success, kitchen urgency, food markers.
        "tertiary":                   "#b91c1c",
        "on-tertiary":                "#ffffff",
        "tertiary-container":         "#fef2f2",
        "on-tertiary-container":      "#991b1b",
        "tertiary-fixed":             "#fef2f2",
        "tertiary-fixed-dim":         "#fecaca",
        "on-tertiary-fixed":          "#7f1d1d",
        "on-tertiary-fixed-variant":  "#991b1b",
        "error":                      "#b91c1c",
        "on-error":                   "#ffffff",
        "error-container":            "#fef2f2",
        "on-error-container":         "#991b1b",
        "success":                    "#15803d",
        "on-success":                 "#ffffff",
        "success-container":          "#f0fdf4",
        "on-success-container":       "#166534",
        "warning":                    "#b45309",
        "on-warning":                 "#ffffff",
        "warning-container":          "#fffbeb",
        "on-warning-container":       "#92400e",
        // FSSAI food-type markers — always paired with a shape, never colour alone.
        "veg":                        "#15803d",
        "non-veg":                    "#b91c1c",
        "egg":                        "#ca8a04",
      },

      // ── Typography ─────────────────────────────────────────────────────────
      // Consume the next/font CSS variables declared on <html> in layout.tsx.
      fontFamily: {
        "display":             ["var(--font-outfit)", "sans-serif"],
        "headline-lg":         ["var(--font-outfit)", "sans-serif"],
        "headline-lg-mobile":  ["var(--font-outfit)", "sans-serif"],
        "headline-md":         ["var(--font-outfit)", "sans-serif"],
        "headline-sm":         ["var(--font-outfit)", "sans-serif"],
        "body-lg":             ["var(--font-inter)", "sans-serif"],
        "body-md":             ["var(--font-inter)", "sans-serif"],
        "body-sm":             ["var(--font-inter)", "sans-serif"],
        "label-bold":          ["var(--font-inter)", "sans-serif"],
      },
      fontSize: {
        "display":            ["48px", { lineHeight: "56px",  letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-lg":        ["32px", { lineHeight: "40px",  fontWeight: "600" }],
        "headline-lg-mobile": ["28px", { lineHeight: "36px",  fontWeight: "600" }],
        "headline-md":        ["24px", { lineHeight: "32px",  fontWeight: "600" }],
        "headline-sm":        ["20px", { lineHeight: "28px",  fontWeight: "600" }],
        "body-lg":            ["18px", { lineHeight: "28px",  fontWeight: "400" }],
        "body-md":            ["16px", { lineHeight: "24px",  fontWeight: "400" }],
        "body-sm":            ["14px", { lineHeight: "20px",  fontWeight: "400" }],
        "label-bold":         ["12px", { lineHeight: "16px",  letterSpacing: "0.05em", fontWeight: "700" }],
      },

      // ── Spacing ────────────────────────────────────────────────────────────
      spacing: {
        "xs":             "4px",
        "sm":             "12px",
        "base":           "8px",
        "md":             "24px",
        "lg":             "40px",
        "xl":             "64px",
        "gutter":         "16px",
        "margin-mobile":  "20px",
        "margin-desktop": "48px",
      },

      // ── Box shadows (ambient / tactile) ────────────────────────────────────
      // Near-hairline elevation. On a monochrome surface, heavy shadows read dated —
      // lift comes from the card being brighter than the page, plus a 1px border.
      // NOTE: also defined as utilities in globals.css; keep both in sync.
      boxShadow: {
        "level-1": "0 1px 2px rgba(28, 25, 23, 0.04), 0 1px 3px rgba(28, 25, 23, 0.06)",
        "level-2": "0 2px 4px rgba(28, 25, 23, 0.04), 0 4px 12px rgba(28, 25, 23, 0.06)",
      },

      // ── Keyframes ──────────────────────────────────────────────────────────
      keyframes: {
        "slide-in": {
          from: { opacity: "0", transform: "translateY(-16px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "slide-in": "slide-in 0.35s ease-out forwards",
        "fade-up":  "fade-up 0.25s ease-out forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
