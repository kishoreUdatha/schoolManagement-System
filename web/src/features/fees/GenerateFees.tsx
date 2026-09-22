"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import type { AcademicYear, SchoolClass } from "@/features/students/types";
import { api, errorText, type Paginated } from "@/lib/api";
import { money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field, monthLabel } from "./common";
import { thisMonth } from "./extra";
import { ordinal } from "./FeeStructureList";
import type { FeeHead, FeeStructure, GenerateResult, StudentFee, TransportFeeResult } from "./types";

import { ask } from "@/lib/dialog";
type Done = { what: string; period: string; created: number; skipped: number; amount?: string; onFile?: number };

/**
 * NEW-041, live. POST /school/fees/generate raises one month's recurring
 * fees for every active student of the year, from the fee structure (the
 * preview lists what it will use: GET /fees/structures, /fees/heads,
 * /classes). POST /school/transport/fees/generate does the same for
 * students on a bus route. Both skip charges that already exist, so running
 * them twice is safe. Hostel fees are raised on SCR-215.
 */
export function GenerateFees() {
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const heads = useApi<FeeHead[]>("/api/v1/school/fees/heads");
  const [yearId, setYearId] = useState<number | null>(null);
  const [period, setPeriod] = useState(thisMonth());
  const [tHead, setTHead] = useState("");
  const [tPeriod, setTPeriod] = useState(thisMonth());
  const [tDue, setTDue] = useState("10");
  const [busy, setBusy] = useState<"" | "fees" | "transport">("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done[]>([]);

  useEffect(() => {
    if (yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);

  const ready = yearId !== null;
  const structures = useApi<FeeStructure[]>(ready ? "/api/v1/school/fees/structures" : null, { academic_year_id: yearId });
  const classes = useApi<SchoolClass[]>(ready ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const year = years.data?.find((y) => y.id === yearId);

  const activeHead = useMemo(() => new Map((heads.data ?? []).map((h) => [h.id, h.is_active])), [heads.data]);
  const className = useMemo(() => new Map((classes.data ?? []).map((c) => [c.id, c.name])), [classes.data]);
  // What generation will use: recurring structures whose head is active.
  const used = (structures.data ?? []).filter((s) => s.is_recurring && activeHead.get(s.fee_head_id) !== false);
  const byHead = new Map<number, FeeStructure[]>();
  used.forEach((s) => byHead.set(s.fee_head_id, [...(byHead.get(s.fee_head_id) ?? []), s]));
  const plan = [...byHead.values()];
  const rows: Row[] = plan.map((ss) => {
    const amounts = ss.map((s) => Number(s.amount));
    const lo = Math.min(...amounts);
    const hi = Math.max(...amounts);
    const days = [...new Set(ss.map((s) => s.due_day_of_month))];
    return [
      `${ss[0].fee_head_name} · ${ss[0].fee_head_code}`,
      ss
        .map((s) => className.get(s.class_id) ?? `Class ${s.class_id}`)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .join(", "),
      lo === hi ? money(lo) : `${money(lo)} – ${money(hi)}`,
      days.length === 1 ? `${ordinal(days[0])} of the month` : "Varies by class",
    ];
  });

  async function onFile(p: string): Promise<number | undefined> {
    try {
      return (await api.get<Paginated<StudentFee>>("/api/v1/school/fees/student-fees", { period: p, page_size: 1 })).total;
    } catch {
      return undefined;
    }
  }

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (!yearId) return;
    if (!(await ask(`Raise ${monthLabel(period)} fees for every active student in ${year?.name ?? "this year"}? Charges that already exist are skipped.`))) return;
    setBusy("fees");
    setError(null);
    try {
      const r = await api.post<GenerateResult>("/api/v1/school/fees/generate", { academic_year_id: yearId, period });
      notify(`${monthLabel(r.period)}: ${r.created} charges raised, ${r.skipped} already existed.`);
      setDone((d) => [{ what: `Class fees · ${year?.name ?? ""}`, period: r.period, created: r.created, skipped: r.skipped, onFile: undefined }, ...d]);
      const total = await onFile(r.period);
      setDone((d) => d.map((x, i) => (i === 0 ? { ...x, onFile: total } : x)));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy("");
    }
  }

  async function transport(e: FormEvent) {
    e.preventDefault();
    const head = heads.data?.find((h) => h.id === Number(tHead));
    if (!(await ask(`Raise ${monthLabel(tPeriod)} transport fees under "${head?.name ?? "this head"}" for every student on a bus route?`))) return;
    setBusy("transport");
    setError(null);
    try {
      const r = await api.post<TransportFeeResult>("/api/v1/school/transport/fees/generate", { fee_head_id: Number(tHead), period: tPeriod, due_day: Number(tDue) || 10 });
      notify(`Transport ${monthLabel(r.period)}: ${r.created} charges raised, ${money(r.total_amount)} in all.`);
      setDone((d) => [{ what: `Transport fees · ${head?.name ?? ""}`, period: r.period, created: r.created, skipped: r.skipped, amount: r.total_amount }, ...d]);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="two-col">
      <div className="stack">
        <ErrorNote>{error ?? years.error ?? structures.error ?? heads.error}</ErrorNote>
        <form id="generate-fees-form" className="panel" onSubmit={generate}>
          <div className="panel-pad">
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">01</span>
                  <h3>Monthly class fees</h3>
                </div>
                <div className="form-grid">
                  <Field label="Academic year" required>
                    <select value={yearId ?? ""} onChange={(e) => setYearId(Number(e.target.value))} required>
                      {!years.data ? <option value="">Loading…</option> : null}
                      {years.data?.map((y) => (
                        <option key={y.id} value={y.id}>
                          {`${y.name}${y.is_current ? " (current)" : ""}`}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Month" required>
                    <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required />
                  </Field>
                </div>
                <p className="muted small" style={{ marginTop: 12 }}>
                  Every active student of the year is charged each monthly fee head their class has in the fee structure, less any concession. The due date comes from the structure.
                </p>
              </section>
            </div>
          </div>
          <div className="form-footer">
            <span>{plan.length ? `${plan.length} fee head${plan.length === 1 ? "" : "s"} across ${new Set(used.map((s) => s.class_id)).size} classes` : "Nothing to raise yet"}</span>
            <button type="submit" className="btn primary" disabled={busy !== "" || !yearId || !plan.length}>
              <Icon name="check" className="sm" />
              {busy === "fees" ? "Generating…" : `Generate ${monthLabel(period)} fees`}
            </button>
          </div>
        </form>
        <Panel title="What will be raised" sub={`Monthly fee heads in the ${year?.name ?? ""} fee structure${structures.loading ? " · Loading…" : ""}`} flush>
          <DataTable
            columns={["Fee head", "Classes", "Amount per student", "Due"]}
            rows={rows}
            selectable={false}
            rowAction={false}
            empty={structures.loading ? "Loading the fee structure…" : "No monthly fees are set up for this year. Add them in the fee structure first."}
          />
        </Panel>
        <form className="panel" onSubmit={transport}>
          <div className="panel-pad">
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">02</span>
                  <h3>Transport fees</h3>
                </div>
                <div className="form-grid">
                  <Field label="Book under fee head" required>
                    <select value={tHead} onChange={(e) => setTHead(e.target.value)} required>
                      <option value="">Select fee head</option>
                      {heads.data
                        ?.filter((h) => h.is_active)
                        .map((h) => (
                          <option key={h.id} value={h.id}>
                            {`${h.name} · ${h.code}`}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Month" required>
                    <input type="month" value={tPeriod} onChange={(e) => setTPeriod(e.target.value)} required />
                  </Field>
                  <Field label="Due on day" required>
                    <input type="number" min={1} max={31} value={tDue} onChange={(e) => setTDue(e.target.value)} required />
                  </Field>
                </div>
                <p className="muted small" style={{ marginTop: 12 }}>Each student with a bus assignment is charged their stop&apos;s fare for the month.</p>
              </section>
            </div>
          </div>
          <div className="form-footer">
            <span>Only students on a route</span>
            <button type="submit" className="btn" disabled={busy !== "" || !tHead}>
              <Icon name="bus" className="sm" />
              {busy === "transport" ? "Generating…" : "Generate transport fees"}
            </button>
          </div>
        </form>
      </div>
      <aside className="stack">
        <div className="aside-panel">
          <h3>Generated this session</h3>
          {done.length ? (
            <dl className="kv">
              {done.map((d, i) => (
                <div key={i}>
                  <dt>{`${d.what} · ${monthLabel(d.period)}`}</dt>
                  <dd>
                    {`${d.created} new charge${d.created === 1 ? "" : "s"}, ${d.skipped} already existed`}
                    {d.amount !== undefined ? ` · ${money(d.amount)} raised` : ""}
                    {d.onFile !== undefined ? ` · ${d.onFile} charges now on file for the month` : ""}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>Nothing generated yet. Running a month twice is safe: charges that already exist are skipped.</p>
          )}
        </div>
        <Panel title="Other fees">
          <div className="event-row">
            <div className="event-content">
              <h4>Hostel fees</h4>
              <p>Raised for residents from the hostel screen.</p>
            </div>
            <Link href={routeOf(215)} className="btn">
              Open
            </Link>
          </div>
          <div className="event-row">
            <div className="event-content">
              <h4>Fee structure</h4>
              <p>Amounts per class and due days.</p>
            </div>
            <Link href={routeOf(155)} className="btn">
              Open
            </Link>
          </div>
          <div className="event-row">
            <div className="event-content">
              <h4>Outstanding dues</h4>
              <p>Who owes what after generating.</p>
            </div>
            <Link href="/fees-finance/outstanding-dues" className="btn">
              Open
            </Link>
          </div>
        </Panel>
      </aside>
    </div>
  );
}
