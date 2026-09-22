"use client";

/*
 * PM-031 · Route & stops: the child's route with every stop in order and its
 * timings (GET /parent/me/children/{id}/transport/stops), the child's own
 * stop marked, for the directions the child rides.
 */

import { useParent } from "@/components/parent/ParentShell";
import { useApi } from "@/lib/useApi";
import { hhmm, PmEmpty, PmError, PmLoading, useGoTo } from "../comms/ui";
import { useTransport } from "./common";

type Stop = { id: number; name: string; sequence: number; pickup_time: string | null; drop_time: string | null; is_mine: boolean };

export function RouteStops() {
  const { childId } = useParent();
  const goTo = useGoTo();
  const tr = useTransport(childId);
  const stops = useApi<Stop[]>(childId ? `/api/v1/parent/me/children/${childId}/transport/stops` : null);

  if (!childId || tr.loading || (stops.loading && !stops.data)) return <PmLoading />;
  if (tr.error) return <PmError>{tr.error}</PmError>;
  const t = tr.data;
  if (!t) return <PmEmpty title="Not using school transport">This child has no active school transport assignment.</PmEmpty>;

  const uses = { pickup: t.direction !== "drop", drop: t.direction !== "pickup" };
  const list = stops.data ?? [];
  const row = (s: Stop, time: string | null, what: string) => (
    <p key={`${what}${s.id}`} className={s.is_mine ? "current" : undefined}>
      <b>{s.name}</b>
      <small>{`${s.is_mine ? "Your stop · " : ""}${what} ${hhmm(time)}`}</small>
    </p>
  );

  return (
    <>
      <p className="lead">{[t.vehicle_label, t.route_name].filter(Boolean).join(" · ")}</p>
      <PmError>{stops.error}</PmError>
      {uses.pickup ? (
        <section className="section">
          <h3>Morning pickup</h3>
          <div className="timeline">
            {list.map((s) => row(s, s.pickup_time, "pickup"))}
            <p>
              <b>School</b>
              <small>Morning arrival</small>
            </p>
          </div>
        </section>
      ) : null}
      {uses.drop ? (
        <section className="section">
          <h3>Afternoon drop</h3>
          <div className="timeline">
            <p>
              <b>School</b>
              <small>Afternoon departure</small>
            </p>
            {[...list].sort((a, b) => (a.drop_time ?? "").localeCompare(b.drop_time ?? "")).map((s) => row(s, s.drop_time, "drop"))}
          </div>
        </section>
      ) : null}
      <button className="action" onClick={() => goTo(32)}>
        Request a stop change
      </button>
    </>
  );
}
