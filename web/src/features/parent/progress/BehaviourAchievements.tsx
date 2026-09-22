"use client";

/*
 * PM-057 · Behaviour & achievements. Only what the school shares with
 * guardians: achievements and milestones such as reading targets
 * (GET /parent/me/children/{id}/achievements), teacher behaviour ratings
 * (GET …/behaviour; the AI suggestion teachers see is never shown) and
 * incidents the school has shared with parents (GET …/discipline). Witness names and counselling case details
 * are not shown; a counselling referral appears only as the action's name.
 */

import { useParent } from "@/components/parent/ParentShell";
import { date, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmEmpty, PmError, PmLoading, useChildPath } from "../support/pm";

type Rating = {
  id: number;
  period_kind: "weekly" | "monthly";
  period_key: string;
  punctuality: number;
  participation: number;
  discipline: number;
  respect: number;
  average: number;
  teacher_note: string | null;
  rated_by_name: string | null;
  created_at: string;
};

type Achievement = {
  id: number;
  title: string;
  category: string;
  description: string | null;
  status: "achieved" | "in_progress";
  achieved_on: string | null;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  recorded_by_name: string | null;
};

type Incident = {
  id: number;
  reference_no: string;
  occurred_on: string;
  category: string;
  severity: "low" | "medium" | "high";
  description: string;
  status: string;
  resolution: string | null;
  shared_with_parents: boolean;
  actions: { id: number; kind: string; details: string | null; start_date: string | null; end_date: string | null }[];
};

const DIMENSIONS = [
  ["punctuality", "Punctuality"],
  ["participation", "Participation"],
  ["discipline", "Discipline"],
  ["respect", "Respect"],
] as const;

const scoreClass = (n: number) => (n >= 4 ? "value good" : n <= 2 ? "value warning" : "value");

export function BehaviourAchievements() {
  return (
    <ChildGate>
      <Behaviour />
    </ChildGate>
  );
}

function Behaviour() {
  const { go, childId } = useParent();
  const base = useChildPath();
  const ratings = useApi<Rating[]>(base && `${base}/behaviour`);
  const incidents = useApi<Incident[]>(base && `${base}/discipline`);
  const achievements = useApi<Achievement[]>(childId ? `/api/v1/parent/me/children/${childId}/achievements` : null);

  if ((ratings.loading && !ratings.data) || (incidents.loading && !incidents.data)) return <PmLoading />;
  const list = ratings.data ?? [];
  const shared = (incidents.data ?? []).filter((i) => i.shared_with_parents);
  const [latest, ...older] = list;

  return (
    <>
      <PmError>{ratings.error || incidents.error || achievements.error}</PmError>
      <Achievements list={achievements.data} />
      {latest ? (
        <>
          <div className="panel soft">
            <span className="eyebrow">{latest.period_kind === "weekly" ? "WEEKLY" : "MONTHLY"} TEACHER RATING</span>
            <h2>{latest.average.toFixed(1)} / 5</h2>
            {latest.teacher_note ? <p>{latest.teacher_note}</p> : null}
            <small>
              {latest.rated_by_name ?? "Teacher"} · {latest.period_key}
            </small>
          </div>
          {DIMENSIONS.map(([k, text]) => (
            <div key={k} className="item">
              <span>
                <strong>{text}</strong>
              </span>
              <span className={scoreClass(latest[k])}>{latest[k]} / 5</span>
            </div>
          ))}
        </>
      ) : ratings.data ? (
        <PmEmpty title="No behaviour ratings yet">Ratings appear here when your child’s teacher posts them.</PmEmpty>
      ) : null}

      {older.length ? (
        <section className="section">
          <h3>Earlier ratings</h3>
          {older.slice(0, 8).map((r) => (
            <div key={r.id} className="item">
              <span>
                <strong>{r.period_key}</strong>
                <small>
                  {r.rated_by_name ?? "Teacher"} · {date(r.created_at)}
                </small>
              </span>
              <span className={scoreClass(r.average)}>{r.average.toFixed(1)} / 5</span>
            </div>
          ))}
        </section>
      ) : null}

      <section className="section">
        <h3>Shared by the school</h3>
        {incidents.data && shared.length === 0 ? (
          <div className="item">
            <span>
              <strong>Teacher follow-up</strong>
              <small>No incidents shared with you</small>
            </span>
            <span className="value good">Up to date</span>
          </div>
        ) : null}
        {shared.map((i) => (
          <div key={i.id} className="panel">
            <span className="eyebrow">
              {label(i.category).toUpperCase()} · {date(i.occurred_on)}
            </span>
            <p style={{ whiteSpace: "pre-line" }}>{i.description}</p>
            {i.actions.length ? (
              <p>
                <b>Action: </b>
                {i.actions
                  .map((a) =>
                    a.kind === "counselling_referral"
                      ? "Referred for support"
                      : `${label(a.kind)}${a.details ? ` (${a.details})` : ""}${a.start_date ? ` · ${date(a.start_date)}${a.end_date ? ` – ${date(a.end_date)}` : ""}` : ""}`,
                  )
                  .join("; ")}
              </p>
            ) : null}
            {i.resolution ? <p>Outcome: {i.resolution}</p> : null}
            <span className={i.status === "closed" || i.status === "dismissed" ? "status" : "status amber"}>{label(i.status)}</span>
          </div>
        ))}
      </section>
      <button className="action secondary" onClick={() => go(45)}>
        Message class teacher
      </button>
    </>
  );
}

function Achievements({ list }: { list: Achievement[] | null }) {
  if (!list) return null;
  const goals = list.filter((a) => a.status === "in_progress");
  const done = list.filter((a) => a.status === "achieved");
  return (
    <section className="section">
      <h3>Achievements & milestones</h3>
      {list.length === 0 ? <p className="micro">No achievements recorded yet. Prizes and milestones your child’s teachers record appear here.</p> : null}
      {goals.map((a) => {
        const target = a.target_value ?? 0;
        const now = Math.min(a.current_value ?? 0, target);
        return (
          <div key={a.id} className="panel soft">
            <span className="eyebrow">{label(a.category).toUpperCase()} MILESTONE</span>
            <h3>{a.title}</h3>
            {a.description ? <p>{a.description}</p> : null}
            <div className="progress-track">
              <span style={{ width: `${target ? (now / target) * 100 : 0}%` }} />
            </div>
            <small>
              {now} of {target}
              {a.unit ? ` ${a.unit}` : ""}
              {a.recorded_by_name ? ` · ${a.recorded_by_name}` : ""}
            </small>
          </div>
        );
      })}
      {done.map((a) => (
        <div key={a.id} className="item">
          <span>
            <strong>{a.title}</strong>
            <small>
              {label(a.category)}
              {a.achieved_on ? ` · ${date(a.achieved_on)}` : ""}
              {a.recorded_by_name ? ` · ${a.recorded_by_name}` : ""}
              {a.description ? ` · ${a.description}` : ""}
            </small>
          </span>
          <span className="value good">Achieved</span>
        </div>
      ))}
    </section>
  );
}
