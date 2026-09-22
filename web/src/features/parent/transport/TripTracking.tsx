"use client";

/*
 * PM-030 · Trip tracking. Shows the bus's last GPS fix with its time. A fix
 * older than STALE_MINUTES is never presented as live: the screen says
 * "Location unavailable" instead. The API gives no ETA, so the stop's
 * scheduled time is shown and labelled as scheduled.
 */

import { useParent } from "@/components/parent/ParentShell";
import { dateTime } from "@/lib/format";
import { hhmm, PmEmpty, PmError, PmLoading, useGoTo } from "../comms/ui";
import { boardingText, currentTrip, gpsAge, isFresh, STALE_MINUTES, stopTime, tripName, useTransport } from "./common";

export function TripTracking() {
  const { childId } = useParent();
  const goTo = useGoTo();
  const tr = useTransport(childId, true);

  if (!childId || (tr.loading && tr.data === null && !tr.error)) return <PmLoading />;
  if (tr.error && !tr.data) return <PmError>{tr.error}</PmError>;
  const t = tr.data;
  if (!t) return <PmEmpty title="Not using school transport">This child has no active school transport assignment.</PmEmpty>;

  const trip = currentTrip(t);
  const live = trip?.trip_status === "in_progress";
  const fresh = isFresh(t);
  const age = gpsAge(t);
  const dir = trip?.direction ?? (t.direction === "drop" ? "drop" : "pickup");

  return (
    <>
      <div className="between">
        <h2>{trip ? tripName(trip.direction) : "No trip today"}</h2>
        <span className={`status ${live ? "blue" : "amber"}`}>{trip ? boardingText({ ...trip, boarding_status: null }) : "No trip"}</span>
      </div>
      {/* The mock's illustrative route drawing is dropped: there is no route geometry in the API. */}
      <div className="metrics two">
        <div className="metric">
          <small>Bus location</small>
          <b>{fresh && live ? (age! < 1 ? "Now" : `${age} min ago`) : "Location unavailable"}</b>
          <small>{t.last_location_at ? `Last GPS ${dateTime(t.last_location_at)}` : "No GPS received"}</small>
        </div>
        <div className="metric">
          <small>Scheduled at stop</small>
          <b>{hhmm(stopTime(t, dir))}</b>
          <small>{t.stop_name}</small>
        </div>
      </div>
      {tr.error ? <PmError>{`Could not refresh: ${tr.error}`}</PmError> : null}
      {fresh && live ? (
        <a className="action secondary" style={{ display: "block", textAlign: "center", textDecoration: "none" }} href={`https://maps.google.com/?q=${t.last_lat},${t.last_lng}`} target="_blank" rel="noopener noreferrer">
          Open bus location in maps
        </a>
      ) : (
        <p className="micro">{live ? `The bus has not reported its position in the last ${STALE_MINUTES} minutes.` : "Location is shown only while a school trip is under way."}</p>
      )}
      {t.today.map((x) => (
        <div className="item" key={x.direction}>
          <span>
            <strong>{`${tripName(x.direction)} · ${boardingText(x)}`}</strong>
            <small>{x.marked_at ? dateTime(x.marked_at) : "Not recorded yet"}</small>
          </span>
          <span className={`value ${x.boarding_status === "absent" ? "warning" : x.boarding_status ? "good" : ""}`}>{x.boarding_status ? "Confirmed" : "—"}</span>
        </div>
      ))}
      <button className="action secondary" onClick={() => goTo(31)}>
        View route stops
      </button>
      <p className="micro">The app shows location only during an authorized school trip. Updates every 30 seconds.</p>
    </>
  );
}
