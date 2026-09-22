"use client";

/*
 * PM-032 · Transport request. The parent API has no endpoint for transport
 * change requests, so the request form is not shown (a form that goes
 * nowhere would mislead). The screen shows the current assignment and points
 * the parent to the school office.
 */

import { useParent } from "@/components/parent/ParentShell";
import { hhmm, PmError, PmLoading, useGoTo } from "../comms/ui";
import { useTransport } from "./common";

export function TransportRequest() {
  const { childId } = useParent();
  const goTo = useGoTo();
  const tr = useTransport(childId);

  if (!childId || tr.loading) return <PmLoading />;
  const t = tr.data;

  return (
    <>
      <PmError>{tr.error}</PmError>
      <div className="panel soft">
        <span className="eyebrow">CURRENT TRANSPORT</span>
        {t ? (
          <>
            <h3>{t.route_name}</h3>
            <p>{`Stop: ${t.stop_name}${t.pickup_time && t.direction !== "drop" ? ` · pickup ${hhmm(t.pickup_time)}` : ""}${t.drop_time && t.direction !== "pickup" ? ` · drop ${hhmm(t.drop_time)}` : ""}`}</p>
          </>
        ) : (
          <p>This child is not using school transport.</p>
        )}
      </div>
      {/* Not wired: request type, effective date, requested stop and reason form — no endpoint accepts transport change requests. */}
      <div className="panel">
        <h3>Changing transport</h3>
        <p>Route, stop or temporary non-use changes are arranged by the school’s transport office. Contact the school office with the change and the date it should start.</p>
      </div>
      <button className="action" onClick={() => goTo(45)}>
        Contact school office
      </button>
      <p className="micro">The current route stays active until the school approves a change.</p>
    </>
  );
}
