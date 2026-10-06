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

export const WALLET = (
  <Svg>
    <rect x="3" y="6" width="18" height="14" rx="3" />
    <path d="M16 13h2M3 9l12-5 2 2" />
  </Svg>
);
export const ARROW_DOWN = (
  <Svg>
    <path d="M12 4v16M6 14l6 6 6-6" />
  </Svg>
);
export const ARROW_UP = (
  <Svg>
    <path d="M12 20V4M6 10l6-6 6 6" />
  </Svg>
);
export const SWAP = (
  <Svg>
    <path d="M4 8h14l-4-4M20 16H6l4 4" />
  </Svg>
);
export const PEOPLE = (
  <Svg>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
    <circle cx="17" cy="9" r="2.6" />
    <path d="M16.5 14.6c2.6.2 4.4 1.9 5 5.4" />
  </Svg>
);

export const CALENDAR = (
  <Svg>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2" />
  </Svg>
);
export const DOC = (
  <Svg>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 12h6M9 16h6" />
  </Svg>
);

export const RUPEE = (
  <Svg>
    <path d="M7 4h11M7 9h11M7 4c5 0 7 1.5 7 5s-3 5-7 5l8 6" />
  </Svg>
);
export const CHECK_CIRCLE = (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 3 3 5-6" />
  </Svg>
);
export const CLOCK = (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
export const EYE = (
  <Svg>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const DOTS = (
  <svg viewBox="0 0 24 24" className="ico" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);
