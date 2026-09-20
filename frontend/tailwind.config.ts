import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // Story 21.1 — per-tenant brand palette via CSS vars
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
        },
        // Theme: surface + ink also via CSS vars so light <-> dark flip works
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          raised: "rgb(var(--surface-raised) / <alpha-value>)",
          subtle: "rgb(var(--surface-subtle) / <alpha-value>)",
          border: "rgb(var(--surface-border) / <alpha-value>)",
          hover: "rgb(var(--surface-hover) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          subtle: "rgb(var(--ink-subtle) / <alpha-value>)",
        },
        // The sidebar is the one dark surface in a white app and needs its
        // own scale; nested components there cannot read --surface.
        sidebar: {
          DEFAULT: "rgb(var(--sidebar) / <alpha-value>)",
          ink: "rgb(var(--sidebar-ink) / <alpha-value>)",
          muted: "rgb(var(--sidebar-ink-muted) / <alpha-value>)",
          hover: "rgb(var(--sidebar-hover) / <alpha-value>)",
          border: "rgb(var(--sidebar-border) / <alpha-value>)",
        },
        // Status, named once so a colour means the same thing everywhere.
        success: {
          DEFAULT: "rgb(var(--success) / <alpha-value>)",
          bg: "rgb(var(--success-bg) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--warning) / <alpha-value>)",
          bg: "rgb(var(--warning-bg) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--danger) / <alpha-value>)",
          bg: "rgb(var(--danger-bg) / <alpha-value>)",
        },
        info: {
          DEFAULT: "rgb(var(--info) / <alpha-value>)",
          bg: "rgb(var(--info-bg) / <alpha-value>)",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--brand-600) / 0.15), 0 8px 24px -8px rgb(var(--brand-600) / 0.22)",
        "glow-sm":
          "0 0 0 1px rgb(var(--brand-600) / 0.2), 0 2px 8px -2px rgb(var(--brand-600) / 0.28)",
        // A white card on a white page needs an edge, not a shadow.
        card: "0 1px 2px 0 rgb(18 35 63 / 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
