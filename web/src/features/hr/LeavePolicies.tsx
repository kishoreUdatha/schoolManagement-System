"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import type { DirectoryPerson, LeaveType } from "./types";
import { Field } from "./ui";

import { ask } from "@/lib/dialog";
const BASE = "/api/v1/school/hr";
const KINDS = ["casual", "sick", "earned", "unpaid", "other"];

/**
 * SCR-180, live: GET/POST /api/v1/school/hr/leave-types, PUT/DELETE
 * /leave-types/{id} (with an optional approver: only they, or a school
 * admin, can then decide that kind of leave); POST /hr/leave-balances/allot gives every member of
 * staff this year's days. The side list is the school's leave types;
 * ?id= picks one, no id means a new one.
 */
export function LeavePolicies() {
  const router = useRouter();
  const path = usePathname();
  const id = useSearchParams().get("id");
  const types = useApi<LeaveType[]>(`${BASE}/leave-types`);
  // Only the people who can decide leave at all: the principal and school admins.
  const people = useApi<DirectoryPerson[]>("/api/v1/school/directory/staff");
  const approvers = (people.data ?? []).filter((p) => p.role === "principal" || p.role === "school_admin");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const year = new Date().getFullYear();
  const t = types.data?.find((x) => String(x.id) === id) ?? null;
  const go = (to: number | null) => router.replace(to ? `${path}?id=${to}` : path, { scroll: false });

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const body = {
      name: text("name"),
      code: text("code").toUpperCase(),
      kind: text("kind") || "casual",
      annual_days: text("annual_days") || "0",
      carry_forward_max: text("carry_forward_max") || "0",
      document_after_days: text("document_after_days") ? Number(text("document_after_days")) : null,
      is_paid: f.get("is_paid") === "on",
      is_active: f.get("is_active") === "on",
      approver_user_id: text("approver_user_id") ? Number(text("approver_user_id")) : null,
    };
    setBusy(true);
    setErr(null);
    try {
      const saved = t ? await api.put<LeaveType>(`${BASE}/leave-types/${t.id}`, body) : await api.post<LeaveType>(`${BASE}/leave-types`, body);
      notify(t ? "Leave policy saved." : "Leave type added.");
      types.reload();
      go(saved.id);
    } catch (x) {
      setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!t || !(await ask(`Delete ${t.name}?`))) return;
    setErr(null);
    try {
      await api.delete(`${BASE}/leave-types/${t.id}`);
      notify("Leave type deleted.");
      types.reload();
      go(null);
    } catch (x) {
      setErr(errorText(x));
    }
  }

  async function allot() {
    if (!(await ask(`Give every member of staff their ${year} leave, carrying forward what each type allows?`))) return;
    setErr(null);
    try {
      const r = await api.post<{ staff: number; types: number; created: number; updated: number }>(`${BASE}/leave-balances/allot`, { year, carry_forward: true });
      notify(`${year} balances: ${r.created} created, ${r.updated} updated across ${r.staff} staff and ${r.types} leave types.`);
    } catch (x) {
      setErr(errorText(x));
    }
  }

  return (
    <div className="settings-layout">
      <nav className="settings-nav">
        {types.data?.map((x) => (
          <a
            key={x.id}
            href={`?id=${x.id}`}
            className={String(x.id) === id ? "active" : ""}
            onClick={(e) => {
              e.preventDefault();
              go(x.id);
            }}
          >
            {`${x.name}${x.is_active ? "" : " (inactive)"}`}
          </a>
        ))}
        <a
          href="?"
          className={!id ? "active" : ""}
          onClick={(e) => {
            e.preventDefault();
            go(null);
          }}
        >
          + New leave type
        </a>
      </nav>
      <div>
        <ErrorNote>{err ?? types.error}</ErrorNote>
        <form id="leave-policy" className="panel" onSubmit={save} key={`${t?.id ?? "new"}-${people.data ? "p" : ""}`}>
          <div className="panel-head">
            <div>
              <h2>{t ? t.name : "New leave type"}</h2>
              <p>{t ? `Code ${t.code} · Changes apply after saving` : "Add a kind of leave staff can take"}</p>
            </div>
          </div>
          <div className="panel-body">
            {types.loading && !types.data ? <p className="muted">Loading leave types…</p> : null}
            <div className="form-grid">
              <Field label="Policy name" required>
                <input name="name" required minLength={2} maxLength={120} defaultValue={t?.name ?? ""} placeholder="Casual leave" />
              </Field>
              <Field label="Code" required>
                <input name="code" required maxLength={20} defaultValue={t?.code ?? ""} placeholder="CL" />
              </Field>
              <Field label="Counts as" required>
                <select name="kind" defaultValue={t?.kind ?? "casual"}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {label(k)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Days a year" required>
                <input name="annual_days" type="number" min={0} max={365} step="0.5" required defaultValue={t ? Number(t.annual_days) : 12} />
              </Field>
              <Field label="Carry-forward limit (days)">
                <input name="carry_forward_max" type="number" min={0} max={365} step="0.5" defaultValue={t ? Number(t.carry_forward_max) : 0} />
              </Field>
              <Field label="Proof needed after (days)">
                <input name="document_after_days" type="number" min={1} max={365} defaultValue={t?.document_after_days ?? ""} placeholder="Never" />
              </Field>
              <label className="field">
                <span>Pay</span>
                <span className="row">
                  <input type="checkbox" name="is_paid" defaultChecked={t?.is_paid ?? true} /> Paid leave
                </span>
              </label>
              <label className="field">
                <span>Status</span>
                <span className="row">
                  <input type="checkbox" name="is_active" defaultChecked={t?.is_active ?? true} /> Staff can apply for it
                </span>
              </label>
              <Field label="Approval manager">
                <select name="approver_user_id" defaultValue={t?.approver_user_id ?? ""}>
                  <option value="">Principal or any school admin</option>
                  {approvers.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {`${p.full_name} · ${label(p.role)}`}
                    </option>
                  ))}
                  {t?.approver_user_id && !approvers.some((p) => p.user_id === t.approver_user_id) ? <option value={t.approver_user_id}>{t.approver_name ?? "Current approver"}</option> : null}
                </select>
              </Field>
            </div>
            <div className="gap" />
            <div className="tip">
              <Icon name="shield" className="sm" />
              <span>{`Balances are given out per calendar year. After changing days, allot ${year} again to update each member of staff.`}</span>
            </div>
          </div>
          <div className="form-footer">
            <span>{t ? `${label(t.kind)} · ${t.is_paid ? "Paid" : "Unpaid"}` : "Fields marked * are required"}</span>
            <div className="actions">
              <button type="button" className="btn" onClick={allot}>
                {`Allot ${year} balances`}
              </button>
              {t ? (
                <button type="button" className="btn" onClick={remove}>
                  Delete
                </button>
              ) : null}
              <button type="submit" className="btn primary" disabled={busy}>
                <Icon name="check" className="sm" />
                {busy ? "Saving…" : t ? "Save leave policy" : "Add leave type"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
