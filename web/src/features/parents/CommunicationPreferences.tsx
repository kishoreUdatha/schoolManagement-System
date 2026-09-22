"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { useHydrated, useSession } from "@/lib/useSession";
import type { Parent, PreferenceRow, Preferences } from "./types";

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
 * SCR-075, live. A signed-in parent: GET/PUT /api/v1/parent/me/preferences
 * ({channel, category, is_enabled}), saved as each switch moves. School staff:
 * pick a parent (?id=, from GET /school/parents) and read or change theirs via
 * GET/PUT /school/parents/{id}/preferences. Attendance and fees, and the
 * in-app inbox, are locked on by the school either way.
 */
export function CommunicationPreferences() {
  const hydrated = useHydrated();
  const s = useSession();
  const isParent = s?.user.role === "parent";
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const parentId = params.get("id");
  const parents = useApi<Parent[]>(hydrated && !isParent ? "/api/v1/school/parents" : null);
  const base = isParent ? "/api/v1/parent/me/preferences" : parentId ? `/api/v1/school/parents/${parentId}/preferences` : null;
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated || !base) return;
    setPrefs(null);
    setError(null);
    api
      .get<Preferences>(base)
      .then(setPrefs)
      .catch((e) => setError(errorText(e)));
  }, [hydrated, base]);

  if (!hydrated) return <Loading what="Loading preferences…" />;
  const who = parents.data?.find((x) => String(x.user_id) === parentId);

  async function toggle(row: PreferenceRow) {
    if (!base) return;
    const key = `${row.channel}-${row.category}`;
    setBusy(key);
    setError(null);
    try {
      const next = await api.put<Preferences>(base, { channel: row.channel, category: row.category, is_enabled: !row.is_enabled });
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
          {isParent
            ? "Choose how school updates reach you. Everything is on unless you turn it off."
            : "What this parent has chosen to be sent. Changes here are made on their behalf and recorded in the audit log."}
        </p>
        {isParent ? null : (
          <label className="field" style={{ marginBottom: 12 }}>
            <span>Parent</span>
            <select
              aria-label="Parent"
              value={parentId ?? ""}
              onChange={(e) => {
                const q = new URLSearchParams(params.toString());
                if (e.target.value) q.set("id", e.target.value);
                else q.delete("id");
                router.replace(`${path}?${q.toString()}`, { scroll: false });
              }}
            >
              <option value="">{parents.loading ? "Loading parents…" : "Select a parent"}</option>
              {parentId && parents.data && !who ? <option value={parentId}>{`Parent #${parentId}`}</option> : null}
              {parents.data?.map((x) => (
                <option key={x.user_id} value={x.user_id}>
                  {`${x.full_name}${x.email ? ` · ${x.email}` : ""}`}
                </option>
              ))}
            </select>
          </label>
        )}
        <ErrorNote>{error ?? parents.error}</ErrorNote>
        {base && !prefs && !error ? <p className="muted">Loading…</p> : null}
        {!base && !isParent ? <p className="muted">Choose a parent to see their preferences.</p> : null}
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
        <span>{isParent ? "Applies to this account · saved as you switch" : who ? `Applies to ${who.full_name} · saved as you switch` : "Saved as you switch"}</span>
      </div>
    </div>
  );
}
