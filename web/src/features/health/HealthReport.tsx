"use client";

/*
 * NEW-107, live: a month of the sick room. GET /health/report?month=YYYY-MM:
 * visits by complaint and outcome, children who came often, check-ups done,
 * vaccines given and overdue.
 */

import Link from "next/link";
import { useState } from "react";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";

type Report = {
  month: string; visits: number; children: number;
  complaints: { complaint: string; visits: number }[];
  outcomes: Record<string, number>;
  frequent: { student_id: number; student_name: string; section_label: string | null; visits: number }[];
  checkups: number; vaccines_given: number; vaccines_overdue: number;
};
const OUTCOME: Record<string, string> = {
  back_to_class: "Back to class", rested: "Rested, then back", sent_home: "Sent home", parent_picked_up: "Picked up by a parent", referred_hospital: "Referred to hospital",
};
const thisMonth = () => new Date().toISOString().slice(0, 7);

export function HealthReport() {
  const [month, setMonth] = useState(thisMonth());
  const r = useApi<Report>("/api/v1/school/health/report", { month });
  const d = r.data;
  const top = Math.max(1, ...(d?.complaints ?? []).map((c) => c.visits));
  return (
    <>
      <div className="filterbar">
        <input type="month" aria-label="Month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>
      <ErrorNote>{r.error}</ErrorNote>
      {!d ? (
        <Loading what="Loading the report…" />
      ) : (
        <>
          <StatStrip
            compact
            items={[
              { label: "Sick-room visits", value: String(d.visits), note: `${d.children} children` },
              { label: "Sent home", value: String((d.outcomes.sent_home ?? 0) + (d.outcomes.parent_picked_up ?? 0)), note: `${d.outcomes.referred_hospital ?? 0} referred to hospital` },
              { label: "Check-ups", value: String(d.checkups), note: "Done this month" },
              { label: "Vaccines", value: String(d.vaccines_given), note: `${d.vaccines_overdue} overdue now` },
            ]}
          />
          <div className="fo-grid">
            <Panel title="What children came in with" flush>
              <div className="table-wrap">
                <table className="data-table">
                  <tbody>
                    {d.complaints.map((c) => (
                      <tr key={c.complaint}>
                        <td style={{ textTransform: "capitalize" }}>{c.complaint}</td>
                        <td className="num">{c.visits}</td>
                        <td style={{ width: "40%" }}>
                          <div className="fo-bar">
                            <span style={{ width: `${(c.visits / top) * 100}%`, background: "#3b6cf6" }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!d.complaints.length ? (
                      <tr>
                        <td className="table-empty">No visits this month.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Panel>
            <div className="stack">
              <Panel title="How visits ended">
                <dl className="bank-rec">
                  {Object.entries(OUTCOME).map(([k, l]) => (
                    <span key={k} style={{ display: "contents" }}>
                      <dt>{l}</dt>
                      <dd>{d.outcomes[k] ?? 0}</dd>
                    </span>
                  ))}
                </dl>
              </Panel>
              <Panel title="Came often" sub="Three visits or more this month" flush>
                <div className="table-wrap">
                  <table className="data-table">
                    <tbody>
                      {d.frequent.map((f) => (
                        <tr key={f.student_id}>
                          <td>
                            <Link href={`${routeOf(217)}?id=${f.student_id}`}>{f.student_name}</Link>
                            <small className="muted" style={{ display: "block" }}>{f.section_label ?? ""}</small>
                          </td>
                          <td className="num">{`${f.visits} visits`}</td>
                        </tr>
                      ))}
                      {!d.frequent.length ? (
                        <tr>
                          <td className="table-empty">Nobody came three times or more.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </>
  );
}
