"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Avatar, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, Kv, Modal, ModalActions, StudentPicker, addDays, formText, today, type PickedStudent } from "@/features/transport/kit";
import { LIB } from "./Catalogue";
import type { Book, Borrower, CopyLookup, Fine, Fines, LibrarySettings, Loan, Member, Reservation, StaffOption } from "./types";

import { ask } from "@/lib/dialog";
const CHANNELS: Record<string, string> = { in_app: "in-app notice", sms: "SMS", email: "email", whatsapp: "WhatsApp", phone: "phone call" };
const PAY: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", cheque: "Cheque", bank_transfer: "Bank transfer", other: "Other" };

const who = (b: Borrower) => (b.borrower_type === "student" ? { borrower_type: "student" as const, student_id: b.student_id } : { borrower_type: "staff" as const, user_id: b.user_id });

/** Student (type-ahead) or staff member (list from /directory/staff). */
function BorrowerPicker({ value, onChange }: { value: Borrower | null; onChange: (b: Borrower | null) => void }) {
  const [kind, setKind] = useState<"student" | "staff">(value?.borrower_type ?? "student");
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const staff = useApi<StaffOption[]>(kind === "staff" ? "/api/v1/school/directory/staff" : null);
  return (
    <>
      <Field label="Member type" required>
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as "student" | "staff");
            setStudent(null);
            onChange(null);
          }}
        >
          <option value="student">Student</option>
          <option value="staff">Staff</option>
        </select>
      </Field>
      {kind === "student" ? (
        <StudentPicker
          label="Member"
          required
          value={student}
          onChange={(s) => {
            setStudent(s);
            onChange(s ? { borrower_type: "student", student_id: s.id, label: s.full_name } : null);
          }}
        />
      ) : (
        <Field label="Member" required>
          <select
            required
            value={value?.borrower_type === "staff" ? value.user_id : ""}
            onChange={(e) => {
              const s = staff.data?.find((x) => String(x.user_id) === e.target.value);
              onChange(s ? { borrower_type: "staff", user_id: s.user_id, label: s.full_name } : null);
            }}
          >
            <option value="">{staff.loading ? "Loading staff…" : "Select staff member"}</option>
            {staff.data?.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {`${s.full_name} · ${label(s.role)}`}
              </option>
            ))}
          </select>
        </Field>
      )}
    </>
  );
}

/** The mock's "Member details" aside, filled from /library/members and the member's open loans. */
function MemberAside({ borrower, reloadKey = 0 }: { borrower: Borrower | null; reloadKey?: number }) {
  const members = useApi<Member[]>(borrower ? `${LIB}/members` : null, borrower ? { q: borrower.label } : undefined);
  const loans = useApi<Loan[]>(borrower ? `${LIB}/loans` : null, borrower ? { ...who(borrower), open_only: true } : undefined);
  const { reload: reloadMembers } = members;
  const { reload: reloadLoans } = loans;
  useEffect(() => {
    if (reloadKey) {
      reloadMembers();
      reloadLoans();
    }
  }, [reloadKey, reloadMembers, reloadLoans]);
  const m = members.data?.find((x) => (borrower?.borrower_type === "student" ? x.student_id === borrower.student_id : x.user_id === (borrower as { user_id?: number } | null)?.user_id));
  const open = loans.data ?? [];
  const nextDue = [...open].sort((a, b) => a.due_on.localeCompare(b.due_on))[0];
  return (
    <aside className="stack">
      <div className="aside-panel">
        <h3>Member details</h3>
        {borrower ? (
          <>
            <div className="person">
              <Avatar name={borrower.label} />
              <div>
                {borrower.label}
                <small>{m?.detail?.replace("�", "·") ?? label(borrower.borrower_type)}</small>
              </div>
            </div>
            <div className="gap" />
            <Kv
              rows={[
                ["Books issued", m ? `${m.out} of ${m.limit}` : String(open.length)],
                ["Due date", nextDue ? `${date(nextDue.due_on)} · ${nextDue.title}` : "—"],
                ["Overdue", m ? String(m.overdue) : "—"],
                ["Fines due", m ? money(m.fine_due) : "—"],
                ["Can borrow", m ? (m.can_borrow ? "Yes" : "No — at limit or blocked") : "Yes"],
              ]}
            />
          </>
        ) : (
          <p>Choose a member to see what they hold.</p>
        )}
      </div>
    </aside>
  );
}

/** Find the open loan for a copy's accession number (GET /library/loans?open_only=true). */
async function openLoanFor(accession: string): Promise<Loan | null> {
  const loans = await api.get<Loan[]>(`${LIB}/loans`, { open_only: true });
  const a = accession.trim().toLowerCase();
  return loans.find((l) => l.accession_no.toLowerCase() === a) ?? null;
}

/** SCR-202, live: POST /library/loans with the borrower and the copy's accession number. */
export function IssueBook() {
  const settings = useApi<LibrarySettings>(`${LIB}/settings`);
  const [borrower, setBorrower] = useState<Borrower | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Loan[]>([]);
  const [formKey, setFormKey] = useState(0);
  const [copy, setCopy] = useState<CopyLookup | null>(null);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const days = borrower?.borrower_type === "staff" ? settings.data?.loan_days_staff : settings.data?.loan_days_student;

  async function lookup(accession: string) {
    setCopy(null);
    setLookupNote(null);
    if (!accession.trim()) return;
    try {
      setCopy(await api.get<CopyLookup>(`${LIB}/copies/lookup`, { accession_no: accession.trim() }));
    } catch (err) {
      setLookupNote(errorText(err));
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!borrower) {
      setError("Choose a member.");
      return;
    }
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const loan = await api.post<Loan>(`${LIB}/loans`, { ...who(borrower), accession_no: formText(f, "accession_no"), due_on: formText(f, "due_on"), remarks: formText(f, "remarks") });
      notify(`Issued “${loan.title}” (${loan.accession_no}) to ${loan.borrower_name}, due ${date(loan.due_on)}.`);
      setIssued((x) => [loan, ...x]);
      setFormKey((k) => k + 1);
      setCopy(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="two-col">
        <form id="issue-form" className="panel" onSubmit={submit}>
          <div className="panel-pad">
            <ErrorNote>{error ?? settings.error}</ErrorNote>
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">01</span>
                  <h3>Details</h3>
                </div>
                <div className="form-grid">
                  <BorrowerPicker value={borrower} onChange={setBorrower} />
                  <Field label="Book barcode" required>
                    <input key={formKey} name="accession_no" required placeholder="Scan or type the accession number" autoFocus onBlur={(e) => lookup(e.target.value)} />
                  </Field>
                  <Field label="Book title">
                    <input
                      readOnly
                      value={copy ? `${copy.title}${copy.author ? ` · ${copy.author}` : ""}` : (lookupNote ?? "")}
                      placeholder="Filled in from the barcode"
                    />
                  </Field>
                  <Field label="Issue date">
                    <input type="date" value={today()} readOnly />
                  </Field>
                  <Field label="Due date">
                    <input type="date" name="due_on" min={today()} placeholder="" defaultValue="" />
                  </Field>
                </div>
                <div className="form-grid">
                  <Field label="Remarks" full>
                    <input key={`r${formKey}`} name="remarks" maxLength={300} placeholder="e.g. Spine loose; for the science project" />
                  </Field>
                </div>
                {copy && copy.status !== "available" ? (
                  <p className="muted small">{copy.status === "on_hold" ? `On hold for ${copy.held_for ?? "a reservation"}.` : `This copy is ${label(copy.status)}.`}</p>
                ) : null}
                {copy?.is_reference ? <p className="muted small">A reference book: it stays in the library.</p> : null}
                <p className="muted small">{days ? `Leave the due date blank for the standard ${days} days (${date(addDays(today(), days))}).` : "Leave the due date blank for the standard loan period."}</p>
              </section>
            </div>
          </div>
          <div className="form-footer">
            <span>Fields marked * are required</span>
            <div className="actions">
              <button type="submit" className="btn primary" disabled={saving}>
                <Icon name="check" className="sm" />
                {saving ? "Issuing…" : "Issue book"}
              </button>
            </div>
          </div>
        </form>
        <MemberAside borrower={borrower} reloadKey={issued.length} />
      </div>
      {issued.length ? (
        <>
          <div className="gap" />
          <Panel title="Issued this session" flush>
            <DataTable columns={["Title", "Copy", "Member", "Due date"]} rows={issued.map((l) => [l.title, l.accession_no, l.borrower_name, date(l.due_on)])} selectable={false} rowAction={false} />
          </Panel>
        </>
      ) : null}
    </>
  );
}

/** SCR-203, live: find the open loan by accession number, then POST /library/loans/{id}/return. */
export function ReturnBook() {
  const [loan, setLoan] = useState<Loan | null>(null);
  const [looking, setLooking] = useState(false);
  const [damaged, setDamaged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accession, setAccession] = useState("");

  async function find() {
    if (!accession.trim()) return;
    setLooking(true);
    setError(null);
    try {
      const l = await openLoanFor(accession);
      setLoan(l);
      if (!l) setError(`No open loan for ${accession.trim()}. It may already be on the shelf.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLooking(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!loan) {
      await find();
      return;
    }
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<Loan>(`${LIB}/loans/${loan.id}/return`, {
        returned_on: formText(f, "returned_on"),
        damaged,
        damage_charge: damaged ? formText(f, "damage_charge") : null,
        note: formText(f, "note"),
      });
      const fine = Number(r.fine_amount);
      notify(`Returned “${r.title}”.${fine > 0 ? ` Fine ${money(fine)} (${r.fine_status === "billed" ? "added to fees" : "to collect"}).` : ""}`);
      setLoan(null);
      setAccession("");
      setDamaged(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const borrower: Borrower | null = loan ? (loan.borrower_type === "student" ? { borrower_type: "student", student_id: loan.student_id!, label: loan.borrower_name } : { borrower_type: "staff", user_id: loan.user_id!, label: loan.borrower_name }) : null;
  return (
    <div className="two-col">
      <form id="return-form" className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Details</h3>
              </div>
              <div className="form-grid">
                <Field label="Book barcode" required>
                  <div className="row">
                    <input
                      required
                      value={accession}
                      onChange={(e) => {
                        setAccession(e.target.value);
                        setLoan(null);
                      }}
                      onBlur={() => !loan && find()}
                      placeholder="Scan or type the accession number"
                      autoFocus
                    />
                    <button type="button" className="btn" onClick={find} disabled={looking}>
                      {looking ? "Finding…" : "Find"}
                    </button>
                  </div>
                </Field>
                <Field label="Book title">
                  <input value={loan?.title ?? ""} readOnly placeholder="Filled from the loan" />
                </Field>
                <Field label="Member">
                  <input value={loan ? `${loan.borrower_name}${loan.borrower_detail ? ` · ${loan.borrower_detail.replace("�", "·")}` : ""}` : ""} readOnly placeholder="Filled from the loan" />
                </Field>
                <Field label="Due date">
                  <input type="date" value={loan?.due_on ?? ""} readOnly />
                </Field>
                <Field label="Return date">
                  <input type="date" name="returned_on" defaultValue={today()} max={today()} />
                </Field>
                <Field label="Fine amount">
                  <input value={loan ? `${money(loan.accruing_fine)}${loan.overdue_days ? ` · ${loan.overdue_days} day(s) late` : ""}` : ""} readOnly placeholder="Worked out by the library rules" />
                </Field>
                <Field label="Book condition">
                  <select value={damaged ? "damaged" : "good"} onChange={(e) => setDamaged(e.target.value === "damaged")}>
                    <option value="good">Good</option>
                    <option value="damaged">Damaged</option>
                  </select>
                </Field>
                {damaged ? (
                  <Field label="Damage charge (₹)">
                    <input name="damage_charge" type="number" min={0} step="0.01" />
                  </Field>
                ) : null}
                <Field label="Remarks" full>
                  <textarea name="note" placeholder="Enter remarks" />
                </Field>
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="submit" className="btn primary" disabled={saving || !loan}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Confirm return"}
            </button>
          </div>
        </div>
      </form>
      <MemberAside borrower={borrower} />
    </div>
  );
}

/** SCR-204, live: POST /loans/{id}/renew, PATCH /loans/{id} (new due date), POST /reservations, /reservations/{id}/cancel. */
export function RenewReserve() {
  const [borrower, setBorrower] = useState<Borrower | null>(null);
  const [tick, setTick] = useState(0);
  const loans = useApi<Loan[]>(borrower ? `${LIB}/loans` : null, borrower ? { ...who(borrower), open_only: true } : undefined);
  const books = useApi<Book[]>(`${LIB}/books`);
  const reservations = useApi<Reservation[]>(`${LIB}/reservations`, { active_only: true });
  const settings = useApi<LibrarySettings>(`${LIB}/settings`);
  const [loanId, setLoanId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holding, setHolding] = useState<Reservation | null>(null);
  const loan = loans.data?.find((l) => String(l.id) === loanId);

  async function run(fn: () => Promise<unknown>, done: string) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      notify(done);
      setTick((t) => t + 1);
      loans.reload();
      reservations.reload();
      books.reload();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const due = formText(f, "due_on");
    if (!loan) {
      setError("Choose a book the member holds.");
      return;
    }
    if (due) run(() => api.patch(`${LIB}/loans/${loan.id}`, { due_on: due, note: formText(f, "note") }), `Due date moved to ${date(due)}.`);
    else run(() => api.post(`${LIB}/loans/${loan.id}/renew`), "Renewed for the standard period.");
  }

  function reserve(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!borrower) {
      setError("Choose a member first.");
      return;
    }
    run(
      () =>
        api.post(`${LIB}/reservations`, {
          ...who(borrower),
          book_id: Number(f.get("book_id")),
          reserved_on: formText(f, "reserved_on"),
          notify_channel: formText(f, "notify_channel"),
        }),
      "Reservation placed.",
    );
  }

  async function saveHold(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (await run(() => api.patch(`${LIB}/reservations/${holding!.id}`, { hold_until: formText(f, "hold_until") }), "Hold extended.")) setHolding(null);
  }

  const rrows: Row[] = (reservations.data ?? []).map((r) => [r.title, r.borrower_name, r.status === "ready" ? `Ready · ${r.held_accession_no ?? ""}` : `Waiting · #${r.queue_position ?? "—"}`, r.hold_until ? date(r.hold_until) : "—", { name: date(r.reserved_on ?? r.created_at), sub: r.notify_channel ? `Notify by ${CHANNELS[r.notify_channel] ?? r.notify_channel}` : undefined }]);
  return (
    <>
      <div className="two-col">
        <form id="renew-form" className="panel" onSubmit={submit}>
          <div className="panel-pad">
            <ErrorNote>{error ?? loans.error ?? reservations.error}</ErrorNote>
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">01</span>
                  <h3>Renew a loan</h3>
                </div>
                <div className="form-grid">
                  <BorrowerPicker
                    value={borrower}
                    onChange={(b) => {
                      setBorrower(b);
                      setLoanId("");
                    }}
                  />
                  <Field label="Book title" required>
                    <select value={loanId} required onChange={(e) => setLoanId(e.target.value)} disabled={!borrower}>
                      <option value="">{borrower ? (loans.loading ? "Loading…" : loans.data?.length ? "Select a book they hold" : "They hold no books") : "Choose a member first"}</option>
                      {loans.data?.map((l) => (
                        <option key={l.id} value={l.id}>
                          {`${l.title} · ${l.accession_no}`}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Current due date">
                    <input type="date" value={loan?.due_on ?? ""} readOnly />
                  </Field>
                  <Field label="New due date">
                    <input type="date" name="due_on" min={today()} key={loanId} />
                  </Field>
                  <Field label="Note" full>
                    <input name="note" placeholder="Why the date changed (kept with the loan)" />
                  </Field>
                </div>
                <p className="muted small">
                  {loan
                    ? `Renewed ${loan.renew_count} of ${settings.data?.max_renewals ?? "—"} time(s). Leave the new date blank to renew for the standard period.`
                    : "Leave the new date blank to renew for the standard period."}
                </p>
              </section>
            </div>
          </div>
          <div className="form-footer">
            <span>Fields marked * are required</span>
            <div className="actions">
              <button type="submit" className="btn primary" disabled={saving || !loan}>
                <Icon name="check" className="sm" />
                {saving ? "Saving…" : "Save renewal"}
              </button>
            </div>
          </div>
        </form>
        <MemberAside borrower={borrower} reloadKey={tick} />
      </div>
      <div className="gap" />
      <form className="panel" onSubmit={reserve}>
        <div className="panel-head">
          <div>
            <h2>Reserve a book</h2>
            <p>{borrower ? `For ${borrower.label}` : "Choose the member above first"}</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="form-grid">
            <Field label="Book" required>
              <select name="book_id" required>
                <option value="">Select book</option>
                {books.data
                  ?.filter((b) => !b.is_reference)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {`${b.title} · ${b.available_copies ? `${b.available_copies} on shelf` : `${b.waiting_reservations} waiting`}`}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Reservation date">
              <input type="date" name="reserved_on" defaultValue={today()} max={today()} />
            </Field>
            <Field label="Notify by">
              <select name="notify_channel" defaultValue="in_app">
                <option value="in_app">In-app notice</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="phone">Phone call</option>
              </select>
            </Field>
            <div className="row" style={{ alignItems: "end" }}>
              <button type="submit" className="btn primary" disabled={saving || !borrower}>
                Save reservation
              </button>
            </div>
          </div>
        </div>
      </form>
      <div className="gap" />
      <Panel title="Reservations" sub={`Held copies wait ${settings.data?.hold_days ?? "—"} day(s)`} flush>
        <DataTable
          columns={["Title", "Member", "Status", "Hold until", "Placed"]}
          rows={rrows}
          selectable={false}
          onView={(i) => setHolding((reservations.data ?? [])[i])}
          empty={reservations.loading ? "Loading…" : "No active reservations."}
        />
      </Panel>
      {holding ? (
        <Modal title={`${holding.title} · ${holding.borrower_name}`} onClose={() => setHolding(null)}>
          <form onSubmit={saveHold}>
            <ErrorNote>{error}</ErrorNote>
            {holding.status === "ready" ? (
              <div className="form-grid">
                <Field label="Hold until">
                  <input type="date" name="hold_until" required defaultValue={holding.hold_until ?? ""} min={today()} />
                </Field>
              </div>
            ) : (
              <p>{`Waiting, position ${holding.queue_position ?? "—"} in the queue.`}</p>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  if ((await ask("Cancel this reservation?")) && (await run(() => api.post(`${LIB}/reservations/${holding.id}/cancel`), "Reservation cancelled."))) setHolding(null);
                }}
              >
                Cancel reservation
              </button>
            </div>
            {holding.status === "ready" ? (
              <ModalActions onClose={() => setHolding(null)} saving={saving} label="Save hold" />
            ) : (
              <div className="actions row">
                <button type="button" className="btn primary" onClick={() => setHolding(null)}>
                  Close
                </button>
              </div>
            )}
          </form>
        </Modal>
      ) : null}
    </>
  );
}

/** SCR-205, live: GET /library/fines, POST /loans/{id}/fine (paid, bill, waived), PATCH /fines/{id}, POST /loans/{id}/lost. */
export function FineDesk() {
  const [status, setStatus] = useState("pending");
  const fines = useApi<Fines>(`${LIB}/fines`, { status });
  const [loan, setLoan] = useState<Loan | null>(null);
  const [accession, setAccession] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The open fine: ?loan= opens one directly; its detail is read fresh from GET /library/fines/{loan_id}.
  const linked = Number(useSearchParams().get("loan")) || null;
  const [fineId, setFineId] = useState<number | null>(linked);
  const detail = useApi<Fine>(fineId ? `${LIB}/fines/${fineId}` : null);
  const fine: Fine | null = fineId === null ? null : detail.data?.loan_id === fineId ? detail.data : (fines.data?.fines.find((x) => x.loan_id === fineId) ?? null);
  const setFine = (f: Fine | null) => setFineId(f ? f.loan_id : null);

  async function run(fn: () => Promise<unknown>, done: string) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      notify(done);
      fines.reload();
      detail.reload();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function find() {
    if (!accession.trim()) return;
    setError(null);
    try {
      const l = await openLoanFor(accession);
      setLoan(l);
      if (!l) setError(`No open loan for ${accession.trim()}.`);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function markLost(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!loan) {
      await find();
      return;
    }
    const f = new FormData(e.currentTarget);
    if (await run(() => api.post(`${LIB}/loans/${loan.id}/lost`, { charge: formText(f, "charge"), note: formText(f, "note") }), `“${loan.title}” marked lost.`)) {
      setLoan(null);
      setAccession("");
    }
  }

  async function correct(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (await run(() => api.patch(`${LIB}/fines/${fine!.loan_id}`, { amount: formText(f, "amount"), note: formText(f, "note") }), "Fine corrected.")) setFine(null);
  }

  const [received, setReceived] = useState("");
  const fineAmount = fine?.amount;
  const [method, setMethod] = useState("cash");
  useEffect(() => {
    if (fineAmount !== undefined) setReceived(String(Number(fineAmount)));
  }, [fineId, fineAmount]);
  const act = async (action: "paid" | "bill" | "waived", done: string) => {
    const body = action === "paid" ? { action, amount_received: received || null, payment_method: method } : { action };
    if (await run(() => api.post(`${LIB}/loans/${fine!.loan_id}/fine`, body), done)) setFine(null);
  };

  const d = fines.data;
  const stats = [
    { label: "Fines waiting", value: d ? String(d.pending) : "…", note: d ? money(d.pending_amount) : "…" },
    { label: "Collected", value: d ? money(d.collected_amount) : "…", note: "Paid at the desk" },
    { label: "Added to fees", value: d ? money(d.billed_amount) : "…", note: "Billed to the student" },
    { label: "Waived", value: d ? money(d.waived_amount) : "…", note: "Written off" },
  ];
  const list = d?.fines ?? [];
  const rows: Row[] = useMemo(() => list.map((x) => [{ name: x.borrower_name, sub: label(x.borrower_type) }, x.title, x.accession_no, `${x.overdue_days} day(s)`, money(x.amount), label(x.status)]), [list]);

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="two-col">
        <form id="lost-form" className="panel" onSubmit={markLost}>
          <div className="panel-pad">
            <ErrorNote>{!fine ? (error ?? fines.error) : null}</ErrorNote>
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">01</span>
                  <h3>Lost book</h3>
                </div>
                <div className="form-grid">
                  <Field label="Book barcode" required>
                    <div className="row">
                      <input
                        required
                        value={accession}
                        onChange={(e) => {
                          setAccession(e.target.value);
                          setLoan(null);
                        }}
                        onBlur={() => !loan && find()}
                        placeholder="Accession number of the lost copy"
                      />
                      <button type="button" className="btn" onClick={find}>
                        Find
                      </button>
                    </div>
                  </Field>
                  <Field label="Member">
                    <input value={loan?.borrower_name ?? ""} readOnly placeholder="Filled from the loan" />
                  </Field>
                  <Field label="Book title">
                    <input value={loan?.title ?? ""} readOnly placeholder="Filled from the loan" />
                  </Field>
                  <Field label="Replacement cost (₹)">
                    <input name="charge" type="number" min={0} step="0.01" placeholder="Blank uses the copy's price" />
                  </Field>
                  <Field label="Note" full>
                    <input name="note" />
                  </Field>
                </div>
                <p className="muted small">A damaged book is recorded when it is returned, on the Return Book screen. Overdue fines are listed below.</p>
              </section>
            </div>
          </div>
          <div className="form-footer">
            <span>Fields marked * are required</span>
            <div className="actions">
              <button type="submit" className="btn primary" disabled={saving || !loan}>
                <Icon name="check" className="sm" />
                Mark as lost
              </button>
            </div>
          </div>
        </form>
        <aside className="stack">
          <div className="aside-panel">
            <h3>Settle a fine</h3>
            <p>Open a fine below to collect it at the desk, add it to the student’s fees, waive it or correct the amount.</p>
          </div>
        </aside>
      </div>
      <div className="gap" />
      <Panel
        title="Fines"
        action={
          <select aria-label="Filter fines" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">To collect</option>
            <option value="billed">Added to fees</option>
            <option value="paid">Collected</option>
            <option value="waived">Waived</option>
            <option value="">All</option>
          </select>
        }
        flush
      >
        <DataTable columns={["Member", "Title", "Copy", "Overdue", "Amount", "Status"]} rows={rows} selectable={false} onView={(i) => setFineId(list[i].loan_id)} empty={fines.loading ? "Loading fines…" : "No fines here."} />
      </Panel>
      {fineId !== null && !fine ? (
        <Modal title="Fine" onClose={() => setFine(null)}>
          <ErrorNote>{detail.error}</ErrorNote>
          <p className="muted">{detail.loading ? "Loading the fine…" : "This fine could not be found."}</p>
        </Modal>
      ) : null}
      {fine ? (
        <Modal title={`${fine.borrower_name} · ${money(fine.amount)}`} onClose={() => setFine(null)}>
          <ErrorNote>{error ?? detail.error}</ErrorNote>
          <Kv
            rows={[
              ["Member", `${fine.borrower_name} · ${label(fine.borrower_type)}`],
              ["Book", `${fine.title} (${fine.accession_no})`],
              ["Issued", date(fine.issued_on)],
              ["Due / returned", `${date(fine.due_on)} / ${date(fine.returned_on)}`],
              ["Overdue", `${fine.overdue_days} day(s)`],
              ["Status", label(fine.status)],
              ...(fine.received ? ([["Received", `${money(fine.received)}${fine.payment_method ? ` · ${PAY[fine.payment_method] ?? fine.payment_method}` : ""}`]] as [string, string][]) : []),
              ["Note", fine.note ?? "—"],
            ]}
          />
          {fine.status === "pending" ? (
            <>
              <div className="form-grid" style={{ marginTop: 12 }}>
                <Field label="Amount received (₹)">
                  <input type="number" min={0} step="0.01" value={received} onChange={(e) => setReceived(e.target.value)} />
                </Field>
                <Field label="Payment method">
                  <select value={method} onChange={(e) => setMethod(e.target.value)}>
                    {Object.entries(PAY).map(([k, t]) => (
                      <option key={k} value={k}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="actions row" style={{ justifyContent: "flex-start" }}>
                <button type="button" className="btn primary" disabled={saving} onClick={() => act("paid", "Fine collected.")}>
                  Collect
                </button>
                {fine.borrower_type === "student" ? (
                  <button type="button" className="btn" disabled={saving} onClick={() => act("bill", "Added to the student's fees.")}>
                    Add to fees
                  </button>
                ) : null}
                <button type="button" className="btn" disabled={saving} onClick={() => act("waived", "Fine waived.")}>
                  Waive
                </button>
              </div>
              <form onSubmit={correct}>
                <div className="form-grid" style={{ marginTop: 16 }}>
                  <Field label="Correct amount (₹)">
                    <input name="amount" type="number" min={0} step="0.01" defaultValue={Number(fine.amount)} />
                  </Field>
                  <Field label="Reason">
                    <input name="note" required />
                  </Field>
                </div>
                <ModalActions onClose={() => setFine(null)} saving={saving} label="Save correction" />
              </form>
            </>
          ) : (
            <div className="actions row">
              <button type="button" className="btn primary" onClick={() => setFine(null)}>
                Close
              </button>
            </div>
          )}
        </Modal>
      ) : null}
    </>
  );
}
