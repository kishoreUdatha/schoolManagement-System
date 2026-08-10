"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import { api } from "@/lib/api";
import { auth } from "@/lib/auth";

export type Branding = {
  school_id: number;
  name: string;
  logo_url: string | null;
  brand_color: string | null;
  app_name: string | null;
};

const DEFAULT_APP_NAME = "SMS";

const BrandingContext = createContext<Branding | null>(null);

export function useBranding() {
  return useContext(BrandingContext);
}

export function appName(b: Branding | null): string {
  return b?.app_name?.trim() || DEFAULT_APP_NAME;
}

/**
 * Wrap protected layouts with this. It fetches /branding/me once the user is
 * authenticated, applies CSS variables on the document root, and exposes the
 * branding via context. Until the fetch resolves, defaults are in effect.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding | null>(null);

  useEffect(() => {
    const token = auth.getToken();
    if (!token) return;
    api
      .get<Branding>("/api/v1/branding/me")
      .then((r) => {
        setBranding(r.data);
        applyBrandColor(r.data.brand_color);
      })
      .catch(() => {});
  }, []);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}

// -------- Color helpers (hex → CSS var triplets across the 50-900 ramp) --------

function applyBrandColor(hex: string | null) {
  if (!hex) {
    // Reset to defaults
    clearBrandVars();
    return;
  }
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  const ramp = generateRamp(r, g, b);
  const root = document.documentElement.style;
  for (const [step, rgb] of Object.entries(ramp)) {
    root.setProperty(`--brand-${step}`, rgb);
  }
}

function clearBrandVars() {
  // Letting the stylesheet defaults take over
  const root = document.documentElement.style;
  ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"].forEach(
    (step) => root.removeProperty(`--brand-${step}`)
  );
}

/**
 * Generate a 10-stop ramp from a base RGB by mixing with white (lighter
 * shades) and black (darker shades). Step 500 is the user-provided color.
 * Returns each step as a "r g b" string (Tailwind's `rgb(var(--...) / a)`
 * pattern expects the components separated by spaces).
 */
function generateRamp(
  r: number,
  g: number,
  b: number
): Record<string, string> {
  // Mix ratios chosen to roughly match Tailwind's hue ramps
  const lightenSteps: Record<string, number> = {
    "50": 0.92,
    "100": 0.83,
    "200": 0.68,
    "300": 0.5,
    "400": 0.28,
  };
  const darkenSteps: Record<string, number> = {
    "600": 0.12,
    "700": 0.24,
    "800": 0.36,
    "900": 0.48,
  };
  const out: Record<string, string> = {};
  for (const [step, t] of Object.entries(lightenSteps)) {
    const lr = Math.round(r + (255 - r) * t);
    const lg = Math.round(g + (255 - g) * t);
    const lb = Math.round(b + (255 - b) * t);
    out[step] = `${lr} ${lg} ${lb}`;
  }
  out["500"] = `${r} ${g} ${b}`;
  for (const [step, t] of Object.entries(darkenSteps)) {
    const dr = Math.round(r * (1 - t));
    const dg = Math.round(g * (1 - t));
    const db = Math.round(b * (1 - t));
    out[step] = `${dr} ${dg} ${db}`;
  }
  return out;
}
