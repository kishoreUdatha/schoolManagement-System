"use client";

/*
 * PM-049 · Authorized pickup. The child's family contacts from
 * GET …/guardians and whether each may collect the child. A parent can add
 * a person allowed to collect (POST, no portal login for them) and remove
 * one they added; the primary guardian is changed only by the school office.
 */

import { useState, type FormEvent } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmEmpty, PmError, PmLoading, useChildPath } from "../support/pm";

import { ask } from "@/lib/dialog";
export type Guardian = {
  guardian_id: number;
  full_name: string;
  phone: string | null;
  relation: string;
  is_primary: boolean;
  can_pickup: boolean;
  is_emergency_contact: boolean;
  has_portal_login: boolean;
};

export const RELATIONS = ["father", "mother", "guardian", "grandparent", "uncle", "aunt", "sibling", "driver", "other"];

/** "9876543210" -> "98•••••210", so a phone never shows in full on a shared screen. */
export const maskPhone = (p: string | null) => (p && p.length > 5 ? `${p.slice(0, 2)}•••••${p.slice(-3)}` : p ?? "");

export function AuthorizedPickup() {
  return (
    <ChildGate>
      <Pickup />
    </ChildGate>
  );
}

function Pickup() {
  const { notify, go } = useParent();
  const base = useChildPath("/guardians");
  const list = useApi<Guardian[]>(base);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ full_name: "", phone: "", relation: "grandparent", is_emergency_contact: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!base) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(base, { full_name: f.full_name.trim(), phone: f.phone.trim(), relation: f.relation, can_pickup: true, is_emergency_contact: f.is_emergency_contact });
      notify(`${f.full_name.trim()} added to the pickup list.`);
      setF({ full_name: "", phone: "", relation: "grandparent", is_emergency_contact: false });
      setAdding(false);
      list.reload();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  async function remove(g: Guardian) {
    if (!base || !(await ask(`Remove ${g.full_name} from the pickup list?`))) return;
    try {
      await api.delete(`${base}/${g.guardian_id}`);
      notify(`${g.full_name} removed.`);
      list.reload();
    } catch (e) {
      setErr(errorText(e));
    }
  }

  return (
    <>
      <PmError>{err || list.error}</PmError>
      {list.loading && !list.data ? <PmLoading /> : null}
      {list.data && list.data.length === 0 ? (
        <PmEmpty title="No one listed yet">The school has not recorded any family contacts for this child.</PmEmpty>
      ) : null}
      {(list.data ?? []).map((g) => (
        <div key={g.guardian_id} className="item">
          <span>
            <strong>{g.full_name}</strong>
            <small>
              {label(g.relation)}
              {g.phone ? ` · ${maskPhone(g.phone)}` : ""}
              {g.is_primary ? " · Primary guardian" : ""}
              {g.is_emergency_contact ? " · Emergency contact" : ""}
            </small>
          </span>
          <span className={g.can_pickup ? "value good" : "value"}>
            {g.can_pickup ? "Can collect" : "Not for pickup"}
            {!g.is_primary && !g.has_portal_login ? (
              <>
                {" · "}
                <button className="text-button" onClick={() => remove(g)}>
                  Remove
                </button>
              </>
            ) : null}
          </span>
        </div>
      ))}
      <div className="panel soft">
        <h3>Checked at the school gate</h3>
        <p>The school checks this list when someone collects your child. The primary guardian can only be changed by the school office.</p>
      </div>

      {adding ? (
        <form onSubmit={add}>
          <label className="field">
            Full name
            <input type="text" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required maxLength={160} />
          </label>
          <label className="field">
            Phone
            <input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required maxLength={20} />
          </label>
          <label className="field">
            Relationship
            <select value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })}>
              {RELATIONS.map((r) => (
                <option key={r} value={r}>
                  {label(r)}
                </option>
              ))}
            </select>
          </label>
          <label className="switch">
            <span>Also an emergency contact</span>
            <input type="checkbox" checked={f.is_emergency_contact} onChange={(e) => setF({ ...f, is_emergency_contact: e.target.checked })} />
          </label>
          <button className="action" type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add to pickup list"}
          </button>
          <button className="action secondary" type="button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <button className="action" onClick={() => go(50)}>
            Request a pickup
          </button>
          <button className="action secondary" onClick={() => setAdding(true)}>
            Add another authorized person
          </button>
        </>
      )}
    </>
  );
}
