"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApi } from "@/lib/useApi";
import type { Staff } from "./types";

/**
 * Choose the member of staff a per-person screen is about, on the screen
 * itself, rather than going to the directory first. Sets ?id= (replacing the
 * address, so Back leaves the screen) and keeps any other parameters.
 */
export function StaffPicker({ label = "Member of staff", compact = false }: { label?: string; compact?: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const id = params.get("id") ?? "";
  const staff = useApi<Staff[]>("/api/v1/school/staff");
  const list = [...(staff.data ?? [])].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.full_name.localeCompare(b.full_name));
  return (
    <label className={`field staff-picker ${compact ? "compact" : ""}`}>
      <span>{label}</span>
      <select
        aria-label={label}
        value={id}
        onChange={(e) => {
          const q = new URLSearchParams(params.toString());
          if (e.target.value) q.set("id", e.target.value);
          else q.delete("id");
          const s = q.toString();
          router.replace(s ? `${path}?${s}` : path, { scroll: false });
        }}
      >
        <option value="">{staff.loading ? "Loading staff…" : "Choose a member of staff"}</option>
        {id && staff.data && !list.some((s) => String(s.id) === id) ? <option value={id}>{`Staff #${id}`}</option> : null}
        {list.map((s) => (
          <option key={s.id} value={s.id}>
            {`${s.full_name} · ${s.employee_no}${s.designation ? ` · ${s.designation}` : ""}${s.is_active ? "" : " (left)"}`}
          </option>
        ))}
      </select>
    </label>
  );
}
