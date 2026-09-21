"use client";

import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { SCREEN_IDS, type ScreenRef } from "@/lib/screenIds";

/** Which of the 296 mock screens you are looking at.
 *
 *  A review aid, not product chrome. Comparing a built page against the mock
 *  it was built from means knowing its number, and the number lives in a
 *  spreadsheet — so it goes in the corner of the page instead, the way the
 *  mock gallery prints it.
 *
 *  Set NEXT_PUBLIC_SCREEN_IDS=off to hide it.
 */
function lookup(pathname: string | null): { route: string; refs: ScreenRef[] } | null {
  if (!pathname) return null;
  const exact = SCREEN_IDS[pathname];
  if (exact) return { route: pathname, refs: exact };

  // /school/students/42 is the student page, which the audit records as
  // /school/students/[id]. Try the id-shaped form, then walk up.
  const parts = pathname.split("/").filter(Boolean);
  for (let i = parts.length; i > 0; i--) {
    const head = "/" + parts.slice(0, i).join("/");
    const asParam = "/" + [...parts.slice(0, i - 1), "[id]"].join("/");
    const hit = SCREEN_IDS[asParam] ?? SCREEN_IDS[head];
    if (hit) return { route: SCREEN_IDS[asParam] ? asParam : head, refs: hit };
  }
  return null;
}

export function ScreenBadge() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const found = useMemo(() => lookup(pathname), [pathname]);

  if (process.env.NEXT_PUBLIC_SCREEN_IDS === "off") return null;

  const primary = found?.refs[0];
  const extra = (found?.refs.length ?? 0) - 1;

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-50 flex flex-row-reverse items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        // Faded until you go looking for it: this is scaffolding for a
        // comparison, and it sits over real pages.
        className="pointer-events-auto rounded-chip border border-surface-border bg-surface-raised px-2.5 py-1 text-[11px] font-bold text-ink-subtle opacity-45 shadow-card transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        title={
          found
            ? found.refs.map((r) => `${r.id} — ${r.name}`).join("\n")
            : "This route is not in the screen audit"
        }
      >
        {primary ? (
          <>
            {primary.id}
            <span className="font-medium"> · {primary.name}</span>
            {extra > 0 && <span className="font-medium"> +{extra}</span>}
          </>
        ) : (
          <span className="font-medium">No screen id for this route</span>
        )}
      </button>

      {/* The other screens that live at this route — a tab, or a form that
          opens over the list. Collapsed, because most routes have one. */}
      {open && found && found.refs.length > 1 && (
        <div className="pointer-events-auto flex max-w-[60vw] flex-wrap items-center justify-end gap-1.5">
          {found.refs.slice(1).map((r) => (
            <span
              key={r.id}
              className="rounded-chip border border-surface-border bg-surface-raised px-2 py-1 text-[11px] text-ink-subtle shadow-card"
            >
              <span className="font-bold">{r.id}</span> · {r.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
