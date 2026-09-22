"use client";

/*
 * PM-047 · Parent profile. The signed-in parent's account
 * (GET /parent/auth/me) and the children linked to it, with how this parent
 * is related to each. A new mobile number or email is a request the school
 * approves (POST /parent/me/requests/contact-change); its status comes from
 * GET /parent/me/requests?kind=contact_change.
 */

import { useState, type FormEvent } from "react";
import { initialsOf, useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { PmError, PmLoading } from "../support/pm";
import { ME, REQUEST_STATUS, type ParentRequest } from "../support/services";

type Me = { id: number; full_name: string; email: string | null; phone: string | null; role: string };

const mask = (p: string) => (p.length > 5 ? `${p.slice(0, 2)}•••••${p.slice(-3)}` : p);

export function ParentProfile() {
  const { children, go } = useParent();
  const me = useApi<Me>("/api/v1/parent/auth/me");
  const changes = useApi<ParentRequest[]>(`${ME}/requests`, { kind: "contact_change" });

  if (me.loading && !me.data) return <PmLoading />;
  if (!me.data) return <PmError>{me.error}</PmError>;
  const u = me.data;
  const relations = Array.from(new Set(children.map((c) => c.relation).filter((r): r is string => Boolean(r))));

  return (
    <>
      <div className="student">
        <span className="avatar">{initialsOf(u.full_name)}</span>
        <div>
          <h2>{u.full_name}</h2>
          <p>Parent account</p>
        </div>
      </div>
      <dl>
        <div>
          <dt>Mobile</dt>
          <dd>{u.phone ? mask(u.phone) : "Not recorded"}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{u.email ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt>Relationship</dt>
          <dd>{relations.length ? relations.map(label).join(", ") : "—"}</dd>
        </div>
      </dl>
      <button className="item" onClick={() => go(5)}>
        <span>
          <strong>My children</strong>
          <small>{children.length ? children.map((c) => c.full_name.split(" ")[0]).join(" · ") : "No child linked yet"}</small>
        </span>
        <span className="value">{children.length}</span>
      </button>
      <button className="item" onClick={() => go(49)}>
        <span>
          <strong>Authorized pickup</strong>
          <small>People permitted to collect your child</small>
        </span>
        <span className="value">›</span>
      </button>
      <button className="item" onClick={() => go(48)}>
        <span>
          <strong>App settings</strong>
          <small>Alerts, password and sign out</small>
        </span>
        <span className="value">›</span>
      </button>
      <ContactChange requests={changes.data ?? []} onSent={changes.reload} />
    </>
  );
}

function ContactChange({ requests, onSent }: { requests: ParentRequest[]; onSent: () => void }) {
  const { notify } = useParent();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ phone: "", email: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pending = requests.find((r) => r.status === "pending");
  const last = requests[0];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.post(`${ME}/requests/contact-change`, {
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
        reason: f.reason.trim() || null,
      });
      notify("Change requested. The school will update your details once approved.");
      setOpen(false);
      setF({ phone: "", email: "", reason: "" });
      onSent();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: number) {
    try {
      await api.post(`${ME}/requests/${id}/cancel`);
      notify("Request withdrawn.");
      onSent();
    } catch (e2) {
      setErr(errorText(e2));
    }
  }

  return (
    <>
      <PmError>{err}</PmError>
      {last ? (
        <div className="item">
          <span>
            <strong>Contact details change</strong>
            <small>
              {last.summary} · {date(last.created_at)}
              {last.decision_note ? ` · ${last.decision_note}` : ""}
            </small>
          </span>
          <span className={REQUEST_STATUS[last.status][1]}>{REQUEST_STATUS[last.status][0]}</span>
        </div>
      ) : null}
      {open ? (
        <form onSubmit={submit}>
          <label className="field">
            New mobile number
            <input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+91 98xxxxxxxx" maxLength={20} />
          </label>
          <label className="field">
            New email address
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={255} />
          </label>
          <label className="field">
            Reason (optional)
            <textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={500} />
          </label>
          <p className="micro">The school verifies the change before it is applied. Leave a field empty to keep it.</p>
          <button className="action" type="submit" disabled={busy || (!f.phone.trim() && !f.email.trim())}>
            {busy ? "Sending…" : "Send change request"}
          </button>
          <button className="action secondary" type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </form>
      ) : pending ? (
        <button className="action secondary" onClick={() => withdraw(pending.id)}>
          Withdraw pending change
        </button>
      ) : (
        <button className="action secondary" onClick={() => setOpen(true)}>
          Request contact details change
        </button>
      )}
    </>
  );
}
