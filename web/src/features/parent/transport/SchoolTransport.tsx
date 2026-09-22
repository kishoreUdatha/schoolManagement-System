"use client";

/* PM-029 · School transport: route, stop, today's trips and boarding for the selected child. */

import { useParent } from "@/components/parent/ParentShell";
import { dateTime } from "@/lib/format";
import { hhmm, PmEmpty, PmError, PmLoading, useGoTo } from "../comms/ui";
import { boardingText, currentTrip, gpsAge, isFresh, stopTime, tripName, useTransport } from "./common";

export function SchoolTransport() {
  const { childId } = useParent();
  const goTo = useGoTo();
  const tr = useTransport(childId, true);

  if (!childId || (tr.loading && tr.data === null && !tr.error)) return <PmLoading />;
  if (tr.error) return <PmError>{tr.error}</PmError>;
  const t = tr.data;
  if (!t) return <PmEmpty title="Not using school transport">This child has no active school transport assignment.</PmEmpty>;

  const trip = currentTrip(t);
  const dir = trip?.direction ?? (t.direction === "drop" ? "drop" : "pickup");
  const age = gpsAge(t);

  return (
    <>
      <div className="panel soft">
        <span className="eyebrow">{trip ? `${tripName(dir).toUpperCase()} · ${boardingText({ ...trip, boarding_status: null }).toUpperCase()}` : "NO TRIP TODAY"}</span>
        <h2>{t.vehicle_label ?? "Bus not assigned"}</h2>
        <p>{`Route: ${t.route_name}${t.registration_no ? ` · ${t.registration_no}` : ""}`}</p>
        <div className="between">
          <span>Scheduled at your stop</span>
          <b>{hhmm(stopTime(t, dir))}</b>
        </div>
        <p className="micro">
          {age === null ? "No bus location received yet." : isFresh(t) ? `Bus location updated ${age < 1 ? "just now" : `${age} min ago`}.` : `Location unavailable · last GPS ${dateTime(t.last_location_at)}`}
        </p>
        <button className="action" onClick={() => goTo(30)}>
          View trip location
        </button>
      </div>
      <button className="item" onClick={() => goTo(31)}>
        <span>
          <strong>{"Pickup & drop stop"}</strong>
          <small>{t.stop_name}</small>
        </span>
        <span className="value">›</span>
      </button>
      {t.today.length ? (
        t.today.map((x) => (
          <button className="item" key={x.direction} onClick={() => goTo(30)}>
            <span>
              <strong>{`${tripName(x.direction)} · boarding`}</strong>
              <small>{`${boardingText(x)}${x.marked_at ? ` · ${dateTime(x.marked_at)}` : ""}`}</small>
            </span>
            <span className={`value ${x.boarding_status === "absent" ? "warning" : x.boarding_status ? "good" : ""}`}>{x.boarding_status ? "Recorded" : "—"}</span>
          </button>
        ))
      ) : (
        <div className="item">
          <span>
            <strong>Boarding update</strong>
            <small>No trips recorded yet today</small>
          </span>
        </div>
      )}
      {t.driver_name ? (
        <div className="item">
          <span>
            <strong>Driver</strong>
            <small>{t.driver_name}</small>
          </span>
          {t.driver_phone ? (
            <a className="value" href={`tel:${t.driver_phone}`}>
              Call
            </a>
          ) : null}
        </div>
      ) : null}
      <button className="item" onClick={() => goTo(45)}>
        <span>
          <strong>Transport coordinator</strong>
          <small>Contact through school office</small>
        </span>
        <span className="value">›</span>
      </button>
      <button className="action secondary" onClick={() => goTo(32)}>
        Request transport change
      </button>
    </>
  );
}
