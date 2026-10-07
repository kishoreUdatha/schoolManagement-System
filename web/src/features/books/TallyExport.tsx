"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { downloadAuthed, Field, isoToday } from "@/features/fees/common";
import { BOOKS, fyStart } from "./common";

/**
 * The page-head "Export to Tally" on every Books of account tab: pick the
 * dates, and GET /books/tally.xml writes the whole books for them (ledgers,
 * then every voucher) as one Tally import file.
 */
export function TallyExport() {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(isoToday());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (to < from) {
      setError("The To date is before the From date.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await downloadAuthed(`${BOOKS}/tally.xml?from=${from}&to=${to}`, `tally_${from}_${to}.xml`);
      notify("Tally file saved. In Tally: Gateway of Tally → Import → Masters, then Import → Vouchers, with this file.");
      setOpen(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Icon name="download" className="sm" />
        Export to Tally
      </button>
      {open ? (
        <Dialog
          open
          title="Export to Tally"
          onClose={() => setOpen(false)}
          onSubmit={save}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                <Icon name="download" className="sm" />
                {busy ? "Preparing…" : "Download Tally file"}
              </button>
            </>
          }
        >
          <ErrorNote>{error}</ErrorNote>
          <p className="muted small" style={{ marginBottom: 12 }}>
            {`Everything in the books from ${date(from)} to ${date(to)}: fees raised, receipts, expenses, petty cash, supplier bills, payroll, refunds and journal vouchers, with the ledgers they use. One file for Tally Prime or Tally.ERP 9.`}
          </p>
          <div className="form-grid">
            <Field label="From" required>
              <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} required />
            </Field>
            <Field label="To" required>
              <input type="date" value={to} max={isoToday()} onChange={(e) => e.target.value && setTo(e.target.value)} required />
            </Field>
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>
            In Tally: Gateway of Tally → Import → Masters, choose this file; then Import → Vouchers with the same file.
          </p>
        </Dialog>
      ) : null}
    </>
  );
}
