"use client";

import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { date, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";

type ClassRow = { name: string; students: number; students_owing: number; raised: string; paid: string; due: string; overdue: string; collected_pct: number };
type Owing = { student_id: number; student_name: string; admission_no: string; class_label: string | null; owed: string; overdue_days: number };
type Overview = {
  year_from: string; year_to: string;
  collected_year: string; collected_month: string; collected_today: string;
  raised: string; due: string; overdue: string; students_owing: number;
  by_class: ClassRow[]; months: { label: string; total: string }[]; top_owing: Owing[];
};

/**
 * NEW-102, live: where fees stand, to read. For the principal, who approves
 * waivers, concessions and refunds without running the counter: collected
 * this year, month and today, what is still owed, class by class, month by
 * month, and the students owing most. GET /api/v1/school/finance/overview.
 */
export function FeeOverview() {
  const r = useApi<Overview>("/api/v1/school/finance/overview");
  const d = r.data;
  if (!d) return r.error ? <ErrorNote>{r.error}</ErrorNote> : <Loading what="Loading fees…" />;
  const raised = Number(d.raised);
  const collectedPct = raised ? Math.round(((raised - Number(d.due)) / raised) * 100) : 0;
  const peak = Math.max(1, ...d.months.map((m) => Number(m.total)));
  return (
    <>
      <StatStrip
        compact
        items={[
          { label: "Collected this year", value: money(d.collected_year), note: `${date(d.year_from)} – ${date(d.year_to)}` },
          { label: "This month", value: money(d.collected_month), note: `Today ${money(d.collected_today)}` },
          { label: "Still owed", value: money(d.due), note: `${collectedPct}% of ${money(d.raised)} collected` },
          { label: "Overdue", value: money(d.overdue), note: d.students_owing ? `${d.students_owing} students owe fees` : "No student owes fees" },
        ]}
      />
      <div className="fo-grid">
        <Panel title="By class" flush>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th className="num">Students</th>
                  <th className="num">Raised</th>
                  <th className="num">Collected</th>
                  <th className="num">Owed</th>
                  <th className="num">Overdue</th>
                  <th>Collected</th>
                </tr>
              </thead>
              <tbody>
                {d.by_class.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td className="num">{c.students_owing ? `${c.students_owing} of ${c.students} owe` : c.students}</td>
                    <td className="num">{money(c.raised)}</td>
                    <td className="num">{money(c.paid)}</td>
                    <td className="num">{Number(c.due) ? money(c.due) : "—"}</td>
                    <td className="num">{Number(c.overdue) ? <span className="badge warn">{money(c.overdue)}</span> : "—"}</td>
                    <td>
                      <div className="fo-bar" title={`${c.collected_pct}%`}>
                        <span style={{ width: `${Math.min(100, c.collected_pct)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
                {!d.by_class.length ? (
                  <tr>
                    <td colSpan={7} className="table-empty">No fees raised yet this year.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="stack">
          <Panel title="Collected month by month">
            <div className="fo-months">
              {d.months.map((m) => (
                <div key={m.label} className="fo-month" title={`${m.label}: ${money(m.total)}`}>
                  <span style={{ height: `${(Number(m.total) / peak) * 100}%` }} />
                  <small>{m.label.slice(0, 3)}</small>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Owing most" sub="Unpaid fees of students still on the roll" flush>
            <div className="table-wrap">
              <table className="data-table">
                <tbody>
                  {d.top_owing.map((o) => (
                    <tr key={o.student_id}>
                      <td className="wrap">
                        {o.student_name}
                        <small className="muted" style={{ display: "block" }}>{[o.class_label, o.admission_no].filter(Boolean).join(" · ")}</small>
                      </td>
                      <td className="num">
                        {money(o.owed)}
                        {o.overdue_days ? <small className="muted" style={{ display: "block" }}>{`${o.overdue_days} days overdue`}</small> : null}
                      </td>
                    </tr>
                  ))}
                  {!d.top_owing.length ? (
                    <tr>
                      <td className="table-empty">Every student is paid up.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
