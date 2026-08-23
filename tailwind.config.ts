import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
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

        // ── Terracotta & Hearth design tokens (hex, for Stitch-style classes) ─
        "surface":                    "#fff8f5",
        "surface-dim":                "#e3d8d2",
        "surface-bright":             "#fff8f5",
        "surface-container-lowest":   "#ffffff",
        "surface-container-low":      "#fdf1eb",
        "surface-container":          "#f7ece6",
        "surface-container-high":     "#f2e6e0",
        "surface-container-highest":  "#ece0da",
        "on-surface":                 "#201a17",
        "on-surface-variant":         "#594139",
        "inverse-surface":            "#352f2b",
        "inverse-on-surface":         "#faeee9",
        "outline":                    "#8d7168",
        "outline-variant":            "#e1bfb4",
        "surface-tint":               "#ab3600",
        "on-primary":                 "#ffffff",
        "primary-container":          "#cc4911",
        "on-primary-container":       "#fffbff",
        "inverse-primary":            "#ffb59c",
        "primary-fixed":              "#ffdbcf",
        "primary-fixed-dim":          "#ffb59c",
        "on-primary-fixed":           "#390c00",
        "on-primary-fixed-variant":   "#822700",
        "on-secondary":               "#ffffff",
        "secondary-container":        "#beead1",
        "on-secondary-container":     "#436b58",
        "secondary-fixed":            "#c1ecd4",
        "secondary-fixed-dim":        "#a5d0b9",
        "on-secondary-fixed":         "#002114",
        "on-secondary-fixed-variant": "#274e3d",
        "tertiary":                   "#b6191a",
        "on-tertiary":                "#ffffff",
        "tertiary-container":         "#d9352f",
        "on-tertiary-container":      "#fffbff",
        "tertiary-fixed":             "#ffdad6",
        "tertiary-fixed-dim":         "#ffb4ab",
        "on-tertiary-fixed":          "#410002",
        "on-tertiary-fixed-variant":  "#93000b",
        "error-container":            "#ffdad6",
        "on-error-container":         "#93000a",
        "on-error":                   "#ffffff",
      },

      // ── Typography ─────────────────────────────────────────────────────────
      fontFamily: {
        "display":             ["Outfit", "sans-serif"],
        "headline-lg":         ["Outfit", "sans-serif"],
        "headline-lg-mobile":  ["Outfit", "sans-serif"],
        "headline-md":         ["Outfit", "sans-serif"],
        "headline-sm":         ["Outfit", "sans-serif"],
        "body-lg":             ["Inter", "sans-serif"],
        "body-md":             ["Inter", "sans-serif"],
        "body-sm":             ["Inter", "sans-serif"],
        "label-bold":          ["Inter", "sans-serif"],
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
      boxShadow: {
        "level-1": "0 4px 12px rgba(32, 26, 23, 0.05)",
        "level-2": "0 8px 24px rgba(32, 26, 23, 0.08)",
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
