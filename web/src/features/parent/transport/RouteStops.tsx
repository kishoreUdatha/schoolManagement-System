"use client";

/* PM-031 · Route & stops: the child's route, designated stop and timings. */

import { useParent } from "@/components/parent/ParentShell";
import { hhmm, PmEmpty, PmError, PmLoading, useGoTo } from "../comms/ui";
import { useTransport } from "./common";

export function RouteStops() {
  const { childId } = useParent();
  const goTo = useGoTo();
  const tr = useTransport(childId);

  if (!childId || tr.loading) return <PmLoading />;
  if (tr.error) return <PmError>{tr.error}</PmError>;
  const t = tr.data;
  if (!t) return <PmEmpty title="Not using school transport">This child has no active school transport assignment.</PmEmpty>;

  const uses = { pickup: t.direction !== "drop", drop: t.direction !== "pickup" };
  return (
    <>
      <p className="lead">{[t.vehicle_label, t.route_name].filter(Boolean).join(" · ")}</p>
      {/* Not wired: the route's other stops — the parent API returns only the child's own stop. */}
      <div className="timeline">
        {uses.pickup ? (
          <p className="current">
            <b>{t.stop_name}</b>
            <small>{`Your stop · morning pickup ${hhmm(t.pickup_time)}`}</small>
          </p>
        ) : null}
        <p>
          <b>School</b>
          <small>{uses.pickup && uses.drop ? "Morning arrival · afternoon departure" : uses.pickup ? "Morning arrival" : "Afternoon departure"}</small>
        </p>
        {uses.drop ? (
          <p className="current">
            <b>{t.stop_name}</b>
            <small>{`Your stop · afternoon drop ${hhmm(t.drop_time)}`}</small>
          </p>
        ) : null}
      </div>
      <button className="action" onClick={() => goTo(32)}>
        Request a stop change
      </button>
    </>
  );
}
