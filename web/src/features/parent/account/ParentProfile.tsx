"use client";

/*
 * PM-047 · Parent profile. The signed-in parent's account
 * (GET /parent/auth/me) and the children linked to it, with how this parent
 * is related to each. The API has no self-service edit for contact details,
 * so changes are requested through the school.
 */

import { initialsOf, useParent } from "@/components/parent/ParentShell";
import { label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { PmError, PmLoading } from "../support/pm";

type Me = { id: number; full_name: string; email: string | null; phone: string | null; role: string };

const mask = (p: string) => (p.length > 5 ? `${p.slice(0, 2)}•••••${p.slice(-3)}` : p);

export function ParentProfile() {
  const { children, go } = useParent();
  const me = useApi<Me>("/api/v1/parent/auth/me");

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
      {/* Not wired: editing own mobile/email — no parent self-service endpoint; the request goes to the school. */}
      <button className="action secondary" onClick={() => go(45)}>
        Request contact details change
      </button>
    </>
  );
}
