"use client";

// Pieces the books statements share: amounts as accountants print them, and
// the small icons on their cards and buttons (the generated Icon set has none).

import type { ReactNode } from "react";

/** 2140000 -> "21,40,000.00"; negatives in brackets; zero as `zero`. */
export function n2(v: string | number | null | undefined, zero = "-"): string {
  const n = Number(v ?? 0);
  if (!n) return zero;
  const s = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${s})` : s;
}

export const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
export const UP = (
  <Svg>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Svg>
);
export const DOWN = (
  <Svg>
    <path d="M7 7l10 10" />
    <path d="M17 9v8H9" />
  </Svg>
);
export const BARS = (
  <svg viewBox="0 0 24 24" className="ico" fill="currentColor" aria-hidden="true">
    <rect x="4" y="12" width="4" height="8" rx="1" />
    <rect x="10" y="7" width="4" height="13" rx="1" />
    <rect x="16" y="3" width="4" height="17" rx="1" />
  </svg>
);
export const RESET = (
  <Svg>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Svg>
);
export const PRINT = (
  <Svg>
    <path d="M6 9V3h12v6" />
    <rect x="3" y="9" width="18" height="8" rx="2" />
    <path d="M7 14h10v7H7z" />
  </Svg>
);
export const XLS = (
  <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
    <rect x="2" y="3" width="20" height="18" rx="3" fill="#1d7a46" />
    <path d="m7 8 4 4-4 4m10-8-4 4 4 4" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
);
export const PDF = (
  <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
    <path d="M5 2h10l5 5v15H5z" fill="none" stroke="#d93025" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M8 16c2-1 4-5 4-8 0 3 2 6 5 7-3 0-6 1-9 1z" fill="none" stroke="#d93025" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

export const BANK = (
  <Svg>
    <path d="M3 10h18L12 4z" />
    <path d="M5 10v8m4.7-8v8m4.6-8v8M19 10v8M3 20h18" />
  </Svg>
);
export const COINS = (
  <Svg>
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
    <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
  </Svg>
);
export const PERCENT = (
  <Svg>
    <path d="M19 5 5 19" />
    <circle cx="7" cy="7" r="2.5" />
    <circle cx="17" cy="17" r="2.5" />
  </Svg>
);
