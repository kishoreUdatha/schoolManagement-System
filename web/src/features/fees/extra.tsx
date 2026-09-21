"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Open a screen's "add" dialog from the page head. The page head is a server
 * component, so its main button is a link to `?new=1`; this reads the flag,
 * opens the dialog and drops the flag from the address. Needs <Suspense>.
 */
export function useNewFlag(value = "1"): [boolean, (open: boolean) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const flagged = params.get("new") === value;
  useEffect(() => {
    if (flagged) {
      setOpen(true);
      router.replace(path, { scroll: false });
    }
  }, [flagged, path, router]);
  return [open, setOpen];
}

/** The mock's on/off switch (`.switch`) with its label row (`.toggle-row`). */
export function ToggleRow({ title, note, checked, onChange }: { title: string; note?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="toggle-row">
      <div>
        <strong>{title}</strong>
        {note ? <p>{note}</p> : null}
      </div>
      <label className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={title} />
        <i />
      </label>
    </div>
  );
}

/** "2026-09" for this month, as <input type="month"> wants it. */
export function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Whole numbers without trailing ".00" for quantities ("12.00" -> "12"). */
export const qty = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "—" : String(Number(v)));
