"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parentRoute } from "@/lib/parentScreens";
import { ChildScoped, dueLabel, PmEmpty, PmError, PmLoading } from "../home/parts";
import type { Homework as Hw, Submission } from "./types";
import { stageOf, useHomeworkWithSubmissions } from "./useHomework";

const TONES = [
  ["color-purple", "purple"],
  ["color-rose", "rose"],
] as const;

/** PM-014. The child's homework split into to do / submitted / reviewed. */
export function Homework() {
  return <ChildScoped render={(childId) => <HomeworkFor childId={childId} />} />;
}

function HomeworkFor({ childId }: { childId: number }) {
  const router = useRouter();
  const { items, error, loading } = useHomeworkWithSubmissions(childId);
  const [tab, setTab] = useState<"todo" | "submitted" | "reviewed">("todo");

  if (error) return <PmError>{error}</PmError>;
  if (loading || !items) return <PmLoading />;

  const staged = items.map((x) => ({ ...x, stage: stageOf(x.hw, x.sub) }));
  const todo = staged.filter((x) => x.stage === "todo").sort((a, b) => a.hw.due_date.localeCompare(b.hw.due_date));
  const submitted = staged.filter((x) => x.stage === "submitted");
  const reviewed = staged.filter((x) => x.stage === "reviewed");
  const done = submitted.length + reviewed.length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const open = (n: number, id: number) => router.push(`${parentRoute(n)}?id=${id}`);

  return (
    <>
      <section className="learning-overview">
        <div>
          <span className="summary-eyebrow">ALL HOMEWORK</span>
          <h2>One task at a time.</h2>
          <p>
            <b>{`${done} of ${items.length}`}</b>
            {" assignments handed in"}
          </p>
        </div>
        <div className="completion-ring" role="img" aria-label={`${pct} percent handed in`}>
          <svg viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r="33" />
            <circle className="ring-progress" cx="40" cy="40" r="33" pathLength="100" style={{ strokeDasharray: `${pct} 100` }} />
          </svg>
          <b>
            {pct}
            <span>%</span>
          </b>
        </div>
      </section>
      <div className="homework-tabs" role="tablist" aria-label="Homework status">
        {(
          [
            ["todo", "To do", todo.length],
            ["submitted", "Submitted", submitted.length],
            ["reviewed", "Reviewed", reviewed.length],
          ] as const
        ).map(([key, label, n]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "selected" : ""} onClick={() => setTab(key)}>
            {label}
            {n ? <span>{n}</span> : null}
          </button>
        ))}
      </div>
      {tab === "todo" ? (
        todo.length ? (
          todo.map(({ hw }, i) => <Assignment key={hw.id} hw={hw} tone={TONES[i % TONES.length]} onOpen={() => open(15, hw.id)} />)
        ) : (
          <PmEmpty title="Nothing to do">New homework from teachers appears here.</PmEmpty>
        )
      ) : null}
      {tab === "submitted" ? (
        submitted.length ? (
          submitted.map(({ hw, sub }, i) => <Assignment key={hw.id} hw={hw} sub={sub} tone={TONES[i % TONES.length]} onOpen={() => open(15, hw.id)} />)
        ) : (
          <PmEmpty title="Nothing awaiting review">Teacher-reviewed work appears under Reviewed.</PmEmpty>
        )
      ) : null}
      {tab === "reviewed" ? (
        reviewed.length ? (
          <>
            <div className="section-head">
              <h3>Recently reviewed</h3>
            </div>
            {reviewed.map(({ hw, sub }) => (
              <button key={hw.id} className="completed-work" onClick={() => open(17, hw.id)}>
                <span className="v-icon blue">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M21 3C7 1 2 8 6 16c5 6 16 1 15-13" />
                    <path d="m3 22 13-13" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </span>
                <span>
                  <small>{(hw.subject_name ?? "Homework").toUpperCase()}</small>
                  <strong>{hw.title}</strong>
                  <small>{sub?.reviewed_by_name ?? hw.created_by_name ?? ""}</small>
                </span>
                <span>
                  {sub?.marking && sub.marking.total !== null ? (
                    <b className="review-score">
                      {sub.marking.total}
                      <span>{`/${sub.marking.max_total}`}</span>
                    </b>
                  ) : null}
                  <small>{sub?.status === "rejected" ? "Needs redo" : "Reviewed ✓"}</small>
                </span>
              </button>
            ))}
          </>
        ) : (
          <PmEmpty title="Nothing reviewed yet">Work the teacher has checked appears here with feedback.</PmEmpty>
        )
      ) : null}
    </>
  );
}

function Assignment({ hw, sub, tone, onOpen }: { hw: Hw; sub?: Submission | null; tone: (typeof TONES)[number]; onOpen: () => void }) {
  return (
    <article className={`assignment ${tone[0]}`}>
      <div className="assignment-head">
        <span className={`v-icon ${tone[1]}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 3h10l5 5v13H5z" />
            <path d="M15 3v6h5" className="cut" />
            <path d="M8 12h8M8 16h6" className="cut" />
          </svg>
        </span>
        <div>
          <small className="subject">{(hw.subject_name ?? "Homework").toUpperCase()}</small>
          <h3>{hw.title}</h3>
          <p>{hw.description.split("\n")[0]}</p>
        </div>
      </div>
      <div className="assignment-footer">
        <p>
          {hw.created_by_name ?? ""}
          <small>{sub ? "Submitted · awaiting review" : dueLabel(hw.due_date)}</small>
        </p>
        <button className="task-open" onClick={onOpen} aria-label={`Open ${hw.title}`}>
          {"Open "}
          <span className="v-icon white mini">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </span>
        </button>
      </div>
    </article>
  );
}
