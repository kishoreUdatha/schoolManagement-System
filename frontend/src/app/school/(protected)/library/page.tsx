"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { BorrowerPicker, BorrowerValue, borrowerPayload } from "@/components/BorrowerPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Table, inr, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

import { LibraryTabs, Loan } from "./LibraryTabs";

type Dashboard = {
  titles: number;
  copies: number;
  on_loan: number;
  overdue: number;
  reservations_ready: number;
  fines_pending: string;
  top_borrowed: { book_id: number; title: string; loans: number }[];
};

type View = "open" | "overdue" | "fines";

export default function CirculationPage() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [view, setView] = useState<View>("open");
  const [loans, setLoans] = useState<Loan[]>([]);
  const [borrower, setBorrower] = useState<BorrowerValue>(null);
  const [accession, setAccession] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [returning, setReturning] = useState<Loan | null>(null);
  const [losing, setLosing] = useState<Loan | null>(null);
  const accRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const params =
        view === "overdue" ? { overdue_only: true } : view === "fines" ? { open_only: false, fines_pending: true } : {};
      const [d, l] = await Promise.all([
        api.get<Dashboard>("/api/v1/school/library/dashboard"),
        api.get<Loan[]>("/api/v1/school/library/loans", { params }),
      ]);
      setDash(d.data);
      setLoans(l.data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function issue(e: FormEvent) {
    e.preventDefault();
    if (!borrower) return;
    setError(null);
    try {
      const { data } = await api.post<Loan>("/api/v1/school/library/loans", {
        ...borrowerPayload(borrower),
        accession_no: accession.trim(),
      });
      setNotice(`Issued “${data.title}” (${data.accession_no}) to ${data.borrower_name}, due ${data.due_on}.`);
      setAccession("");
      accRef.current?.focus();
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function act(l: Loan, path: string, body: object, msg: string) {
    setError(null);
    try {
      await api.post(`/api/v1/school/library/loans/${l.id}/${path}`, body);
      setNotice(msg);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader title="Library" subtitle="Issue and return books, handle renewals, lost copies and fines." />
      <LibraryTabs />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {dash && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Titles" value={dash.titles} hint={`${dash.copies} copies`} />
          <StatCard label="On loan" value={dash.on_loan} />
          <StatCard label="Overdue" value={dash.overdue} accent={dash.overdue ? "rose" : "brand"} />
          <StatCard label="Ready for pickup" value={dash.reservations_ready} accent={dash.reservations_ready ? "amber" : "brand"} />
          <StatCard label="Fines to collect" value={inr(dash.fines_pending)} accent={Number(dash.fines_pending) ? "amber" : "brand"} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Issue a book</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={issue} className="space-y-3">
            <BorrowerPicker value={borrower} onChange={setBorrower} />
            <div className="flex flex-wrap items-end gap-3">
              <Input
                ref={accRef}
                label="Accession no. (scan or type)"
                value={accession}
                onChange={(e) => setAccession(e.target.value)}
                required
              />
              <Button type="submit" disabled={!borrower || !accession.trim()}>
                Issue
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <div className="flex gap-2">
        {(["open", "overdue", "fines"] as View[]).map((v) => (
          <Button key={v} size="sm" variant={view === v ? "primary" : "secondary"} onClick={() => setView(v)}>
            {v === "open" ? "On loan" : v === "overdue" ? "Overdue" : "Fines to collect"}
          </Button>
        ))}
      </div>

      <Card>
        <Table head={["Book", "Borrower", "Issued", "Due", "Fine", ""]} empty={loans.length === 0 && "Nothing here."}>
          {loans.map((l) => {
            const overdue = !l.returned_on && !l.lost_on && l.due_on < today;
            return (
              <tr key={l.id} className="hover:bg-surface-hover">
                <td className={tdStrong}>
                  {l.title}
                  <div className="text-xs font-normal text-ink-subtle">{l.accession_no}</div>
                </td>
                <td className={td}>
                  {l.borrower_name}
                  <div className="text-xs text-ink-subtle">{l.borrower_detail}</div>
                </td>
                <td className={td}>{l.issued_on}</td>
                <td className={`px-3 py-2 ${overdue ? "font-medium text-danger" : "text-ink-muted"}`}>
                  {l.due_on}
                  {overdue && <div className="text-xs">{l.overdue_days} day(s) late</div>}
                  {l.renew_count > 0 && <div className="text-xs text-ink-subtle">renewed {l.renew_count}×</div>}
                </td>
                <td className={td}>
                  {Number(l.fine_amount) > 0 ? (
                    <>
                      {inr(l.fine_amount)} <Badge tone={l.fine_status === "pending" ? "amber" : "neutral"}>{l.fine_status}</Badge>
                      {l.fine_note && <div className="text-xs text-ink-subtle">{l.fine_note}</div>}
                    </>
                  ) : Number(l.accruing_fine) > 0 ? (
                    <span className="text-xs text-warning">{inr(l.accruing_fine)} if returned today</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                  {!l.returned_on && !l.lost_on && (
                    <>
                      <Button size="sm" onClick={() => setReturning(l)}>
                        Return
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => act(l, "renew", {}, `Renewed “${l.title}”.`)}>
                        Renew
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setLosing(l)}>
                        Lost
                      </Button>
                    </>
                  )}
                  {l.fine_status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => act(l, "fine", { action: "paid" }, "Fine collected.")}>
                        Collected
                      </Button>
                      {l.borrower_type === "student" && (
                        <Button size="sm" variant="secondary" onClick={() => act(l, "fine", { action: "bill" }, "Added to the student's fees.")}>
                          Add to fees
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => act(l, "fine", { action: "waived" }, "Fine waived.")}>
                        Waive
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>

      {dash && dash.top_borrowed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Most borrowed (last 90 days)</CardTitle>
          </CardHeader>
          <CardBody>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
              {dash.top_borrowed.map((b) => (
                <li key={b.book_id}>
                  <span className="text-ink">{b.title}</span> · {b.loans} loans
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}

      {returning && (
        <ReturnModal
          loan={returning}
          onClose={() => setReturning(null)}
          onDone={(msg) => {
            setReturning(null);
            setNotice(msg);
            load();
          }}
        />
      )}
      {losing && (
        <LostModal
          loan={losing}
          onClose={() => setLosing(null)}
          onDone={(msg) => {
            setLosing(null);
            setNotice(msg);
            load();
          }}
        />
      )}
    </div>
  );
}

function ReturnModal({ loan, onClose, onDone }: { loan: Loan; onClose: () => void; onDone: (m: string) => void }) {
  const [damaged, setDamaged] = useState(false);
  const [charge, setCharge] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const { data } = await api.post<Loan>(`/api/v1/school/library/loans/${loan.id}/return`, {
        damaged,
        damage_charge: damaged && charge ? charge : null,
        note: note || null,
      });
      const fine = Number(data.fine_amount);
      onDone(
        `Returned “${loan.title}”.` +
          (fine > 0 ? ` Fine ${inr(fine)} (${data.fine_status === "billed" ? "added to fees" : "to collect"}).` : "")
      );
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <Modal open onClose={onClose} title={`Return “${loan.title}”`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-muted">
          {loan.borrower_name} · due {loan.due_on}
          {Number(loan.accruing_fine) > 0 && ` · late fine ${inr(loan.accruing_fine)}`}
        </p>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={damaged} onChange={(e) => setDamaged(e.target.checked)} />
          Returned damaged
        </label>
        {damaged && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Damage charge ₹" type="number" min="0" value={charge} onChange={(e) => setCharge(e.target.value)} />
            <Input label="What's damaged" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Return</Button>
        </div>
      </form>
    </Modal>
  );
}

function LostModal({ loan, onClose, onDone }: { loan: Loan; onClose: () => void; onDone: (m: string) => void }) {
  const [charge, setCharge] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title={`Mark “${loan.title}” as lost`}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const { data } = await api.post<Loan>(`/api/v1/school/library/loans/${loan.id}/lost`, {
              charge: charge === "" ? null : charge,
              note: note || null,
            });
            onDone(`Marked lost. Charge ${inr(data.fine_amount)}.`);
          } catch (err) {
            setError(apiError(err));
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Charge ₹" placeholder="Copy's price" type="number" min="0" value={charge} onChange={(e) => setCharge(e.target.value)} />
          <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger">
            Mark lost
          </Button>
        </div>
      </form>
    </Modal>
  );
}
