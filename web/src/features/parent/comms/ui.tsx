"use client";

/*
 * Small pieces shared by the wired parent screens PM-021…PM-040: loading,
 * error and empty states in the pack's own classes, a numeric ?param reader
 * and time formatting. Kept here (not in src/components) because only these
 * screens use them.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, type CSSProperties, type ReactNode } from "react";
import { parentRoute } from "@/lib/parentScreens";

/** Go to parent screen n with query params (useParent().go has no query). */
export function useGoTo() {
  const router = useRouter();
  return useCallback(
    (n: number, q?: Record<string, string | number>) => {
      const qs = q ? new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)])).toString() : "";
      router.push(qs ? `${parentRoute(n)}?${qs}` : parentRoute(n));
    },
    [router],
  );
}

/** The pack has no red status pill; failed states use this. */
export const BAD_STATUS: CSSProperties = { background: "#fde4e7", color: "#c33546" };

export function PmLoading({ what = "Loading…" }: { what?: string }) {
  return <p className="muted">{what}</p>;
}

export function PmError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="panel soft" role="alert">
      <p className="bad">{children}</p>
    </div>
  );
}

export function PmEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="panel soft">
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

/** A positive integer from the query string, or null. */
export function useQueryId(name: string): number | null {
  const v = Number(useSearchParams().get(name));
  return Number.isInteger(v) && v > 0 ? v : null;
}

/** "09:20:00" -> "9:20 AM". */
export function hhmm(t: string | null | undefined): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  const ap = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m ?? 0).padStart(2, "0")} ${ap}`;
}

/** Re-run `fn` every `ms` while the page is open. */
export function useEvery(ms: number, fn: () => void, on = true) {
  useEffect(() => {
    if (!on) return;
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  }, [ms, fn, on]);
}
