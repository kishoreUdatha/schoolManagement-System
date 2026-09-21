"use client";

import { Fragment, useEffect, useState } from "react";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useHydrated, useSession } from "@/lib/useSession";
import type { PreferenceRow, Preferences } from "./types";

const CHANNEL: Record<string, string> = { in_app: "In the app", email: "Email", sms: "SMS", whatsapp: "WhatsApp" };
const CATEGORY_NOTE: Record<string, string> = {
  attendance: "Keep track of absence and late entry.",
  fees: "Know when a fee payment is due.",
  exams: "Results, report cards and exam timetables.",
  homework: "New homework and due dates.",
  events: "Events, trips and consent requests.",
  general: "Notices and other school updates.",
};

/**
 * SCR-075, live for a signed-in parent: GET/PUT /api/v1/parent/me/preferences
 * ({channel, category, is_enabled}), saved as each switch moves. Attendance
 * and fees, and the in-app inbox, are locked on by the school.
 */
export function CommunicationPreferences() {
  const hydrated = useHydrated();
  const s = useSession();
  const isParent = s?.user.role === "parent";
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!isParent) return;
    api
      .get<Preferences>("/api/v1/parent/me/preferences")
      .then(setPrefs)
      .catch((e) => setError(errorText(e)));
  }, [isParent]);

  if (!hydrated) return <Loading what="Loading preferences…" />;
  if (!isParent) {
    // Not wired for staff: the API only lets a parent read and change their own preferences
    // (/parent/me/preferences); there is no school-side endpoint for another person's.
    return (
      <div className="panel">
        <div className="panel-pad">
          <h2>Notification preferences</h2>
          <p className="muted small" style={{ margin: "8px 0 0" }}>
            Each parent chooses these from their own portal account. The school cannot view or change another person’s preferences; attendance and fee messages always reach parents regardless.
          </p>
        </div>
      </div>
    );
  }

  async function toggle(row: PreferenceRow) {
    const key = `${row.channel}-${row.category}`;
    setBusy(key);
    setError(null);
    try {
      const next = await api.put<Preferences>("/api/v1/parent/me/preferences", { channel: row.channel, category: row.category, is_enabled: !row.is_enabled });
      setPrefs(next);
      notify(row.is_enabled ? `${label(row.category)} by ${CHANNEL[row.channel] ?? row.channel} turned off.` : `${label(row.category)} by ${CHANNEL[row.channel] ?? row.channel} turned on.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const channels = [...new Set(prefs?.rows.map((r) => r.channel))];

  return (
    <div className="panel">
      <div className="panel-pad">
        <h2>Notification preferences</h2>
        <p className="muted small" style={{ margin: "8px 0 15px" }}>
          Choose how school updates reach you. Everything is on unless you turn it off.
        </p>
        <ErrorNote>{error}</ErrorNote>
        {!prefs && !error ? <p className="muted">Loading…</p> : null}
        {channels.map((ch) => (
          <Fragment key={ch}>
            <h3 style={{ margin: "14px 0 4px" }}>{CHANNEL[ch] ?? label(ch)}</h3>
            {prefs!.rows
              .filter((r) => r.channel === ch)
              .map((r) => (
                <div className="toggle-row" key={`${r.channel}-${r.category}`}>
                  <div>
                    <strong>{label(r.category)}</strong>
                    <p>{r.locked_because ?? CATEGORY_NOTE[r.category] ?? ""}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      aria-label={`${label(r.category)} by ${CHANNEL[ch] ?? ch}`}
                      checked={r.is_enabled}
                      disabled={r.locked || busy === `${r.channel}-${r.category}`}
                      onChange={() => toggle(r)}
                    />
                    <i />
                  </label>
                </div>
              ))}
          </Fragment>
        ))}
      </div>
      <div className="form-footer">
        <span>Applies to this account · saved as you switch</span>
      </div>
    </div>
  );
}
