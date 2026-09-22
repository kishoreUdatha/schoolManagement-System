"use client";

import { useState, type FormEvent } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { parentRoute } from "@/lib/parentScreens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { ActionLink } from "../home/parts";
import { ME, REQUEST_STATUS, type ParentRequest } from "../support/services";

const RELATIONS = ["father", "mother", "guardian", "other"];

/**
 * PM-004. A parent asks the school to link a child to their account
 * (POST /parent/me/requests/link-child: admission number, date of birth,
 * relationship). The school office checks the details and approves; the
 * child then appears under My children. Earlier requests and their status
 * come from GET /parent/me/requests?kind=link_child.
 */
export function LinkChild() {
  const sess = useSession();
  const signedIn = sess?.user.role === "parent";
  if (!signedIn) {
    return (
      <>
        <p className="lead">Sign in to ask the school to link your child to your account.</p>
        <ActionLink href={parentRoute(2)}>Sign in</ActionLink>
      </>
    );
  }
  return <LinkForm />;
}

function LinkForm() {
  const { children, reloadChildren, notify, loading } = useParent();
  const reqs = useApi<ParentRequest[]>(`${ME}/requests`, { kind: "link_child" });
  const [f, setF] = useState({ admission_no: "", date_of_birth: "", relation: "father", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.post(`${ME}/requests/link-child`, {
        admission_no: f.admission_no.trim(),
        date_of_birth: f.date_of_birth,
        relation: f.relation,
        note: f.note.trim() || null,
      });
      notify("Request sent. The school will verify it.");
      setF({ admission_no: "", date_of_birth: "", relation: f.relation, note: "" });
      reqs.reload();
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
      reqs.reload();
    } catch (e2) {
      setErr(errorText(e2));
    }
  }

  const list = reqs.data ?? [];
  const pending = list.some((r) => r.status === "pending");

  return (
    <>
      <p className="lead">Enter your child’s details exactly as the school has them. The school verifies the relationship before linking.</p>
      <form onSubmit={submit}>
        {err ? (
          <div className="panel soft" role="alert">
            <p className="bad">{err}</p>
          </div>
        ) : null}
        <label className="field">
          Admission number
          <input value={f.admission_no} onChange={(e) => setF({ ...f, admission_no: e.target.value })} required maxLength={40} placeholder="e.g. ADM0003" />
        </label>
        <label className="field">
          Child’s date of birth
          <input type="date" value={f.date_of_birth} onChange={(e) => setF({ ...f, date_of_birth: e.target.value })} required />
        </label>
        <label className="field">
          Your relationship
          <select value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })}>
            {RELATIONS.map((r) => (
              <option key={r} value={r}>
                {label(r)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Note for the school (optional)
          <textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={500} />
        </label>
        <button className="action" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send link request"}
        </button>
      </form>

      {list.length ? (
        <section className="section">
          <h3>Your link requests</h3>
          {list.map((r) => {
            const [text, cls] = REQUEST_STATUS[r.status];
            return (
              <div key={r.id} className="item">
                <span>
                  <strong>{r.student_name ?? `Admission no. ${r.details.admission_no}`}</strong>
                  <small>
                    Sent {date(r.created_at)}
                    {r.decision_note ? ` · ${r.decision_note}` : ""}
                    {r.status === "pending" ? (
                      <>
                        {" · "}
                        <button type="button" className="text-button" onClick={() => withdraw(r.id)}>
                          Withdraw
                        </button>
                      </>
                    ) : null}
                  </small>
                </span>
                <span className={cls}>{text}</span>
              </div>
            );
          })}
        </section>
      ) : null}

      {pending ? (
        <div className="panel soft">
          <span className="status amber">Pending school verification</span>
          <p>Once the school verifies the relationship, your child appears under My children and their records become available.</p>
        </div>
      ) : null}
      <p className="micro">
        {loading ? "Checking your linked children…" : `${children.length} ${children.length === 1 ? "child is" : "children are"} linked to your account.`}
      </p>
      <button
        type="button"
        className="action secondary"
        onClick={() => {
          reloadChildren();
          reqs.reload();
          notify("Checked with the school for newly linked children.");
        }}
      >
        Check again
      </button>
      <ActionLink secondary href={parentRoute(5)}>
        Back to my children
      </ActionLink>
    </>
  );
}
