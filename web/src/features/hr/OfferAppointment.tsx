"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { CandidateTabs, useApplication } from "./CandidateDetails";
import type { Application, Department, StaffMember } from "./types";
import { Dialog, Field, KV } from "./ui";

import { ask, askText } from "@/lib/dialog";
const BASE = "/api/v1/school/hr";
const ROLES = ["teacher", "staff", "principal", "accountant"];
/** Fired when the offer changes, so the page-head letter button refreshes. */
const CHANGED = "offer:changed";

/**
 * The page-head button: "Generate letter" opens the offer letter PDF
 * (GET /hr/offers/{id}/letter) once an offer exists; before that it saves
 * the offer form.
 */
export function OfferLetterAction() {
  const { data: a, reload } = useApplication();
  useEffect(() => {
    window.addEventListener(CHANGED, reload);
    return () => window.removeEventListener(CHANGED, reload);
  }, [reload]);
  const offer = a?.offer ?? null;
  if (!offer) {
    return (
      <button type="submit" form="offer-form" className="btn primary">
        <Icon name="check" className="sm" />
        Save offer
      </button>
    );
  }
  return (
    <button
      type="button"
      className="btn primary"
      title="Open the offer letter as a PDF"
      onClick={() => api.open(`${BASE}/offers/${offer.id}/letter`).catch((e) => notify(errorText(e)))}
    >
      <Icon name="download" className="sm" />
      Generate letter
    </button>
  );
}

/**
 * SCR-177, live: POST /api/v1/school/hr/applications/{id}/offer drafts the
 * offer; POST /hr/offers/{id}/send, /respond, /withdraw and /hire move it on.
 * Hiring creates the staff record (with the offer's department and
 * reporting manager) and returns a temporary password, shown once. The
 * letter is GET /hr/offers/{id}/letter.
 */
export function OfferAppointment() {
  const router = useRouter();
  const path = usePathname();
  const { id, data: a, error, loading, reload } = useApplication();
  const apps = useApi<Application[]>(`${BASE}/applications`);
  const departments = useApi<Department[]>("/api/v1/school/departments");
  const staff = useApi<StaffMember[]>("/api/v1/school/staff", { status: "active" });
  const suggestedNo = useApi<{ employee_no: string }>("/api/v1/school/staff/next-employee-no");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [responding, setResponding] = useState<boolean | null>(null);
  const [hiring, setHiring] = useState(false);
  const [hired, setHired] = useState<{ employee_no: string; temporary_password: string } | null>(null);

  async function run<T>(fn: () => Promise<T>, done: string): Promise<T | undefined> {
    setErr(null);
    setBusy(true);
    try {
      const r = await fn();
      notify(done);
      reload();
      apps.reload();
      window.dispatchEvent(new Event(CHANGED));
      return r;
    } catch (e) {
      setErr(errorText(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function draft(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!a) {
      setErr("Choose a candidate first.");
      return;
    }
    if (a.offer) {
      setErr("This application already has an offer. Withdraw it to draft another.");
      return;
    }
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    await run(
      () =>
        api.post(`${BASE}/applications/${a.id}/offer`, {
          role_title: text("role_title"),
          annual_salary: text("annual_salary"),
          joining_date: text("joining_date"),
          valid_till: text("valid_till") || null,
          terms: text("terms") || null,
          department_id: text("department_id") ? Number(text("department_id")) : null,
          reporting_manager_id: text("reporting_manager_id") ? Number(text("reporting_manager_id")) : null,
        }),
      "Offer drafted. Mark it sent once the letter has gone out.",
    );
  }

  async function respond(e: FormEvent<HTMLFormElement>) {
    if (!a?.offer || responding === null) return;
    const note = String(new FormData(e.currentTarget).get("note") ?? "").trim() || null;
    const ok = await run(() => api.post(`${BASE}/offers/${a.offer!.id}/respond`, { accept: responding, note }), responding ? "Marked as accepted." : "Marked as declined.");
    if (ok !== undefined) setResponding(null);
  }

  async function hire(e: FormEvent<HTMLFormElement>) {
    if (!a?.offer) return;
    const f = new FormData(e.currentTarget);
    const r = await run(
      () => api.post<{ employee_no: string; temporary_password: string }>(`${BASE}/offers/${a.offer!.id}/hire`, { employee_no: String(f.get("employee_no") ?? "").trim() || null, role: String(f.get("role") ?? "teacher") }),
      "Hired and added to staff.",
    );
    if (r) {
      setHiring(false);
      setHired(r);
    }
  }

  if (id && loading && !a) return <Loading what="Loading the application…" />;

  const offer = a?.offer ?? null;
  const locked = Boolean(offer) || busy;
  const candidates = (apps.data ?? []).filter((x) => x.id === a?.id || !["hired", "rejected", "withdrawn"].includes(x.stage));

  return (
    <>
      {a ? (
        <section className="panel profile-banner" style={{ marginBottom: 18 }}>
          <CandidateTabs id={a.id} active={177} />
        </section>
      ) : null}
      <ErrorNote>{err ?? error ?? apps.error}</ErrorNote>
      <div className="two-col">
        <form id="offer-form" className="panel" onSubmit={draft}>
          <div className="panel-pad">
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">01</span>
                  <h3>Details</h3>
                </div>
                <div className="form-grid" key={`${a?.id}-${offer?.id}`}>
                    <Field label="Candidate" required>
                      <select value={a?.id ?? ""} required onChange={(e) => router.replace(e.target.value ? `${path}?id=${e.target.value}` : path)}>
                        <option value="">{apps.loading ? "Loading applications…" : "Select candidate"}</option>
                        {candidates.map((x) => (
                          <option key={x.id} value={x.id}>
                            {`${x.candidate_name} · ${x.opening_title}`}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Position" required>
                      <input name="role_title" disabled={locked} required minLength={2} maxLength={160} defaultValue={offer?.role_title ?? a?.opening_title ?? ""} placeholder="Enter position" />
                    </Field>
                    <Field label="Joining date" required>
                      <input name="joining_date" disabled={locked} type="date" required defaultValue={offer?.joining_date ?? ""} />
                    </Field>
                    <Field label="Annual salary (₹)" required>
                      <input name="annual_salary" disabled={locked} type="number" min={1} max={100000000} step="0.01" required defaultValue={offer ? Number(offer.annual_salary) : ""} placeholder="Enter annual salary" />
                    </Field>
                    <Field label="Reply by">
                      <input name="valid_till" disabled={locked} type="date" defaultValue={offer?.valid_till ?? ""} />
                    </Field>
                    <Field label="Department">
                      <select name="department_id" disabled={locked} defaultValue={offer?.department_id ?? ""}>
                        <option value="">{departments.data?.length ? "No department" : "No departments set up yet"}</option>
                        {departments.data?.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Reporting manager">
                      <select name="reporting_manager_id" disabled={locked} defaultValue={offer?.reporting_manager_id ?? ""}>
                        <option value="">{staff.loading ? "Loading staff…" : "Not set"}</option>
                        {staff.data?.map((m) => (
                          <option key={m.id} value={m.id}>
                            {`${m.full_name}${m.designation ? ` · ${m.designation}` : ""}`}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Terms" full>
                      <textarea name="terms" disabled={locked} rows={3} maxLength={10000} defaultValue={offer?.terms ?? ""} />
                    </Field>
                </div>
              </section>
            </div>
          </div>
          <div className="form-footer">
            <span>{offer ? "An offer cannot be edited once drafted; move it on from the panel beside." : "Fields marked * are required"}</span>
            <div className="actions">
              <button type="button" className="btn" onClick={() => router.push(a ? `${routeOf(175)}?id=${a.id}` : routeOf(174))}>
                Cancel
              </button>
              {!offer ? (
                <button type="submit" className="btn primary" disabled={busy || !a}>
                  <Icon name="check" className="sm" />
                  {busy ? "Saving…" : "Save offer"}
                </button>
              ) : null}
            </div>
          </div>
        </form>
        <aside className="stack">
          <div className="aside-panel">
            <h3>Human resources</h3>
            <KV
              rows={[
                ["Candidate", a?.candidate_name ?? "—"],
                ["Stage", a ? label(a.stage) : "—"],
                ["Offer", offer ? <Badge>{label(offer.status)}</Badge> : "Not drafted"],
                ["Department", offer?.department_name ?? "—"],
                ["Reporting to", offer?.reporting_manager_name ?? "—"],
                ["Salary", offer ? `${money(offer.annual_salary)} a year` : "—"],
                ["Joining", offer ? date(offer.joining_date) : "—"],
                ["Sent", offer?.sent_at ? dateTime(offer.sent_at) : "—"],
                ["Answered", offer?.responded_at ? dateTime(offer.responded_at) : "—"],
              ]}
            />
            {offer?.response_note ? <p>{offer.response_note}</p> : null}
            <div className="gap" />
            {!a ? <p>Choose a candidate to draft an offer.</p> : null}
            {offer ? (
              <div className="stack">
                <button type="button" className="btn" onClick={() => api.open(`${BASE}/offers/${offer.id}/letter`).catch((e) => setErr(errorText(e)))}>
                  <Icon name="download" className="sm" />
                  Offer letter (PDF)
                </button>
                {offer.status === "draft" ? (
                  <button type="button" className="btn primary" disabled={busy} onClick={async () => (await ask("Mark this offer as sent to the candidate?")) && run(() => api.post(`${BASE}/offers/${offer.id}/send`), "Offer marked as sent.")}>
                    Mark as sent
                  </button>
                ) : null}
                {offer.status === "draft" || offer.status === "sent" ? (
                  <>
                    <button type="button" className="btn" disabled={busy} onClick={() => setResponding(true)}>
                      Candidate accepted
                    </button>
                    <button type="button" className="btn" disabled={busy} onClick={() => setResponding(false)}>
                      Candidate declined
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={async () => {
                        const note = (await askText("Why is the offer being withdrawn? (optional)"));
                        if (note === null) return;
                        run(() => api.post(`${BASE}/offers/${offer.id}/withdraw`, undefined, { note: note.trim() || null }), "Offer withdrawn.");
                      }}
                    >
                      Withdraw offer
                    </button>
                  </>
                ) : null}
                {offer.status === "accepted" && !a?.hired_staff_id ? (
                  <button type="button" className="btn primary" disabled={busy} onClick={() => setHiring(true)}>
                    <Icon name="users" className="sm" />
                    Add to staff
                  </button>
                ) : null}
                {a?.hired_staff_id ? <p>Hired and added to the staff directory.</p> : null}
              </div>
            ) : (
              <p>Review the information, then save the offer.</p>
            )}
          </div>
        </aside>
      </div>

      {responding !== null ? (
        <Dialog title={responding ? "Candidate accepted" : "Candidate declined"} onClose={() => setResponding(null)} onSubmit={respond} submit="Record" busy={busy} error={err}>
          <Field label={responding ? "Note" : "Why did they decline?"} full>
            <textarea name="note" rows={3} maxLength={500} />
          </Field>
        </Dialog>
      ) : null}

      {hiring ? (
        <Dialog title={`Add ${a?.candidate_name} to staff`} onClose={() => setHiring(false)} onSubmit={hire} submit="Hire" busy={busy} error={err}>
          <div className="form-grid">
            <Field label="Employee number">
              <input key={suggestedNo.data?.employee_no ?? "loading"} name="employee_no" maxLength={40} defaultValue={suggestedNo.data?.employee_no ?? ""} placeholder="Given automatically" />
            </Field>
            <Field label="Role" required>
              <select name="role" defaultValue="teacher">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {label(r)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Dialog>
      ) : null}

      {hired ? (
        <Dialog title="Staff record created" onClose={() => setHired(null)}>
          <p>{`Employee no. ${hired.employee_no}\nTemporary password: ${hired.temporary_password}\n\nGive this to them now — it will not be shown again.`}</p>
        </Dialog>
      ) : null}
    </>
  );
}
