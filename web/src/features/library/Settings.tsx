"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, Kv, formNum, formText } from "@/features/transport/kit";
import { LIB } from "./Catalogue";
import type { LibrarySettings as Settings } from "./types";

type Full = Settings & { fine_fee_head_id: number | null };
type FeeHead = { id: number; name: string; code: string };

const SECTIONS: [string, string][] = [
  ["loans", "Loans & limits"],
  ["fines", "Fines"],
  ["holds", "Reservations"],
];

/** NEW-073, live: GET /library/settings and PATCH /library/settings; fee heads from GET /fees/heads. */
export function LibrarySettings() {
  const settings = useApi<Full>(`${LIB}/settings`);
  const heads = useApi<FeeHead[]>("/api/v1/school/fees/heads", { active_only: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = settings.data;

  if (settings.loading && !s) return <Loading what="Loading library settings…" />;
  if (!s) return <ErrorNote>{settings.error ?? "Library settings could not be loaded."}</ErrorNote>;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api.patch(`${LIB}/settings`, {
        loan_days_student: formNum(f, "loan_days_student"),
        loan_days_staff: formNum(f, "loan_days_staff"),
        max_books_student: formNum(f, "max_books_student"),
        max_books_staff: formNum(f, "max_books_staff"),
        max_renewals: formNum(f, "max_renewals"),
        fine_per_day: formText(f, "fine_per_day"),
        // Blank clears these two: no cap, and fines are not added to fees on their own.
        max_fine_per_loan: formText(f, "max_fine_per_loan"),
        fine_fee_head_id: formNum(f, "fine_fee_head_id"),
        hold_days: formNum(f, "hold_days"),
      });
      notify("Library settings saved. New loans follow them from now on.");
      settings.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const head = heads.data?.find((h) => h.id === s.fine_fee_head_id);
  return (
    <div className="settings-layout">
      <nav className="settings-nav">
        {SECTIONS.map(([id, t], i) => (
          <a key={id} href={`#${id}`} className={i === 0 ? "active" : ""}>
            {t}
          </a>
        ))}
      </nav>
      <div className="stack">
        <ErrorNote>{error ?? heads.error}</ErrorNote>
        <form id="library-settings" onSubmit={save} key={`${JSON.stringify(s)}-${heads.data ? "heads" : "wait"}`} className="stack">
          <section className="panel" id="loans">
            <div className="panel-head">
              <div>
                <h2>Loans & limits</h2>
                <p>How long a book may be kept and how many at once</p>
              </div>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <Field label="Loan period for students (days)" required>
                  <input type="number" name="loan_days_student" required min={1} max={365} defaultValue={s.loan_days_student} />
                </Field>
                <Field label="Loan period for staff (days)" required>
                  <input type="number" name="loan_days_staff" required min={1} max={365} defaultValue={s.loan_days_staff} />
                </Field>
                <Field label="Books a student may hold" required>
                  <input type="number" name="max_books_student" required min={0} max={50} defaultValue={s.max_books_student} />
                </Field>
                <Field label="Books a staff member may hold" required>
                  <input type="number" name="max_books_staff" required min={0} max={100} defaultValue={s.max_books_staff} />
                </Field>
                <Field label="Renewals allowed per loan" required>
                  <input type="number" name="max_renewals" required min={0} max={10} defaultValue={s.max_renewals} />
                </Field>
              </div>
            </div>
          </section>
          <section className="panel" id="fines">
            <div className="panel-head">
              <div>
                <h2>Fines</h2>
                <p>Charged for each day a book is returned late</p>
              </div>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <Field label="Fine per day (₹)" required>
                  <input type="number" name="fine_per_day" required min={0} step="0.01" defaultValue={Number(s.fine_per_day)} />
                </Field>
                <Field label="Most a single loan can be fined (₹)">
                  <input type="number" name="max_fine_per_loan" min={0} step="0.01" defaultValue={s.max_fine_per_loan === null ? "" : Number(s.max_fine_per_loan)} placeholder="No cap" />
                </Field>
                <Field label="Fee head for student fines" full>
                  <select name="fine_fee_head_id" defaultValue={s.fine_fee_head_id ?? ""}>
                    <option value="">None: collect fines at the library desk</option>
                    {heads.data?.map((h) => (
                      <option key={h.id} value={h.id}>
                        {`${h.name} (${h.code})`}
                      </option>
                    ))}
                    {/* Keep the saved head selectable even before the list loads (or if it is inactive), so saving never clears it by accident. */}
                    {s.fine_fee_head_id && !head ? <option value={s.fine_fee_head_id}>{heads.data ? `Fee head #${s.fine_fee_head_id} (inactive)` : `Fee head #${s.fine_fee_head_id}`}</option> : null}
                  </select>
                </Field>
              </div>
              <p className="muted small" style={{ marginTop: 10 }}>
                With a fee head chosen, a student&apos;s fine is added to their school fees under it, and the desk can use “Add to fees”. Staff fines are always collected at the desk.
              </p>
            </div>
          </section>
          <section className="panel" id="holds">
            <div className="panel-head">
              <div>
                <h2>Reservations</h2>
                <p>When a reserved book comes back</p>
              </div>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <Field label="Days a returned book is held for the reserver" required>
                  <input type="number" name="hold_days" required min={1} max={30} defaultValue={s.hold_days} />
                </Field>
              </div>
            </div>
          </section>
          <div className="panel">
            <div className="form-footer">
              <span>Changes apply to loans and fines from now on; existing loans keep their due dates.</span>
              <div className="actions">
                <button type="submit" className="btn primary" disabled={saving}>
                  <Icon name="check" className="sm" />
                  {saving ? "Saving…" : "Save settings"}
                </button>
              </div>
            </div>
          </div>
        </form>
        <div className="aside-panel">
          <h3>In effect now</h3>
          <Kv
            rows={[
              ["Students", `${s.max_books_student} book(s) for ${s.loan_days_student} days`],
              ["Staff", `${s.max_books_staff} book(s) for ${s.loan_days_staff} days`],
              ["Renewals", String(s.max_renewals)],
              ["Fine", `${money(s.fine_per_day)} a day${s.max_fine_per_loan !== null ? `, at most ${money(s.max_fine_per_loan)}` : ""}`],
              ["Student fines", s.fine_fee_head_id ? `Added to fees${head ? ` (${head.name})` : ""}` : "Collected at the desk"],
              ["Reservation hold", `${s.hold_days} day(s)`],
            ]}
          />
        </div>
      </div>
    </div>
  );
}
