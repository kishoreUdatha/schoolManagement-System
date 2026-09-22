"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { EVENT_AUDIENCE, EVENT_KINDS, type EventAudience, type SchoolEvent, eventStatus, useCurrentClasses } from "./shared";

/**
 * SCR-247 Create / Edit Event. New: POST /api/v1/school/events (a draft).
 * Edit (?id=): PUT /api/v1/school/events/{id}. "Publish event" saves, then
 * POST /events/{id}/publish, which is what notifies the audience. There is
 * no GET for one event, so edit mode finds it in GET /api/v1/school/events.
 */
export function EventForm() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const list = useApi<SchoolEvent[]>(id ? "/api/v1/school/events" : null);
  const existing = useMemo(() => list.data?.find((e) => String(e.id) === id) ?? null, [list.data, id]);
  const { classes } = useCurrentClasses();

  const [audience, setAudience] = useState<EventAudience>("everyone");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [consent, setConsent] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setAudience(existing.audience);
    setClassId(existing.class_id ? String(existing.class_id) : "");
    setSectionId(existing.section_id ? String(existing.section_id) : "");
    setConsent(existing.requires_consent);
    setStartTime(existing.start_time?.slice(0, 5) ?? "");
  }, [existing]);

  if (id && list.loading && !list.data) return <Loading what="Loading the event…" />;
  if (id && list.data && !existing) return <ErrorNote>This event was not found. It may have been deleted.</ErrorNote>;
  const e = existing;
  const sections = classes.find((c) => String(c.id) === classId)?.sections ?? [];
  const locked = Boolean(e?.is_cancelled);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const submitter = (ev.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const publish = submitter?.value === "publish";
    const f = new FormData(ev.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    if ((audience === "class_parents" || audience === "section_parents") && !classId) return setError("Choose the class.");
    if (audience === "section_parents" && !sectionId) return setError("Choose the section.");
    const body = {
      title: text("title"),
      kind: text("kind") ?? "other",
      start_date: text("start_date"),
      end_date: text("end_date"),
      start_time: text("start_time"),
      end_time: text("start_time") ? text("end_time") : null,
      venue: text("venue"),
      description: text("description"),
      audience,
      class_id: audience === "class_parents" || audience === "section_parents" ? Number(classId) : null,
      section_id: audience === "section_parents" ? Number(sectionId) : null,
      requires_consent: audience === "staff" ? false : consent,
      consent_deadline: consent && audience !== "staff" ? text("consent_deadline") : null,
      fee_amount: text("fee_amount"),
      coordinator: text("coordinator"),
      capacity: text("capacity") ? Number(text("capacity")) : null,
    };
    setSaving(true);
    setError(null);
    try {
      const saved = e ? await api.put<SchoolEvent>(`/api/v1/school/events/${e.id}`, body) : await api.post<SchoolEvent>("/api/v1/school/events", body);
      if (publish && !saved.is_published) {
        try {
          await api.post(`/api/v1/school/events/${saved.id}/publish`);
          notify(`Published. ${saved.audience_label || "The audience"} will be notified.`);
        } catch (err) {
          notify(`Saved as a draft, but not published: ${errorText(err)}`);
        }
      } else {
        notify(e ? "Event updated." : "Draft saved. Publish it to tell the audience.");
      }
      router.push(`${routeOf(248)}?id=${saved.id}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function act(action: "cancel" | "delete") {
    if (!e) return;
    const ask = action === "cancel" ? `Cancel "${e.title}"? Everyone who was told about it will be notified.` : `Delete the draft "${e.title}"?`;
    if (!window.confirm(ask)) return;
    try {
      if (action === "delete") await api.delete(`/api/v1/school/events/${e.id}`);
      else await api.post(`/api/v1/school/events/${e.id}/cancel`);
      notify(action === "delete" ? "Draft deleted." : "Event cancelled.");
      router.push(routeOf(246));
    } catch (err) {
      setError(errorText(err));
    }
  }

  const field = (text: string, control: JSX.Element, required = false, full = false) => (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {text}
        {required ? <span className="req">*</span> : null}
      </span>
      {control}
    </label>
  );

  return (
    <div className="two-col">
      <form id="event-form" className="panel" onSubmit={submit} key={e?.id ?? "new"}>
        <div className="panel-pad">
          <ErrorNote>{error ?? list.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Event details</h3>
              </div>
              <div className="form-grid">
                {field("Event title", <input name="title" required minLength={2} maxLength={200} defaultValue={e?.title} placeholder="Enter event title" />, true)}
                {field(
                  "Event type",
                  <select name="kind" required defaultValue={e?.kind ?? "academic"}>
                    {EVENT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {label(k)}
                      </option>
                    ))}
                  </select>,
                  true,
                )}
                {field("Date", <input type="date" name="start_date" required defaultValue={e?.start_date} />, true)}
                {field("Ends on", <input type="date" name="end_date" defaultValue={e && e.end_date !== e.start_date ? e.end_date : ""} />)}
                {field("Start time", <input type="time" name="start_time" value={startTime} onChange={(x) => setStartTime(x.target.value)} />)}
                {field("End time", <input type="time" name="end_time" disabled={!startTime} defaultValue={e?.end_time?.slice(0, 5) ?? ""} />)}
                {field("Venue", <input name="venue" maxLength={200} defaultValue={e?.venue ?? ""} placeholder="Enter venue" />)}
                {field("Cost per student", <input type="number" name="fee_amount" min={0} step="0.01" defaultValue={e?.fee_amount ?? ""} placeholder="Leave blank if free" />)}
                {field("Coordinator", <input name="coordinator" maxLength={160} defaultValue={e?.coordinator ?? ""} placeholder="Who runs it" />)}
                {field("Capacity", <input type="number" name="capacity" min={1} step={1} defaultValue={e?.capacity ?? ""} placeholder="Leave blank for no limit" />)}
              </div>
            </section>
            <section>
              <div className="form-section-title">
                <span className="number">02</span>
                <h3>Audience & consent</h3>
              </div>
              <div className="form-grid">
                {field(
                  "Audience",
                  <select
                    value={audience}
                    onChange={(x) => {
                      setAudience(x.target.value as EventAudience);
                      setSectionId("");
                    }}
                  >
                    {(Object.keys(EVENT_AUDIENCE) as EventAudience[]).map((a) => (
                      <option key={a} value={a}>
                        {EVENT_AUDIENCE[a]}
                      </option>
                    ))}
                  </select>,
                )}
                {audience === "class_parents" || audience === "section_parents"
                  ? field(
                      "Class",
                      <select
                        value={classId}
                        required
                        onChange={(x) => {
                          setClassId(x.target.value);
                          setSectionId("");
                        }}
                      >
                        <option value="">Select class</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>,
                      true,
                    )
                  : null}
                {audience === "section_parents"
                  ? field(
                      "Section",
                      <select value={sectionId} required disabled={!classId} onChange={(x) => setSectionId(x.target.value)}>
                        <option value="">Select section</option>
                        {sections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>,
                      true,
                    )
                  : null}
                {field(
                  "Parent consent required",
                  <select value={consent ? "yes" : "no"} disabled={audience === "staff"} onChange={(x) => setConsent(x.target.value === "yes")}>
                    <option value="no">No</option>
                    <option value="yes">Yes (trips, activities)</option>
                  </select>,
                )}
                {consent && audience !== "staff" ? field("Consent by", <input type="date" name="consent_deadline" defaultValue={e?.consent_deadline ?? ""} />) : null}
                {field("Description", <textarea name="description" maxLength={5000} defaultValue={e?.description ?? ""} placeholder="Enter description" />, false, true)}
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="button" className="btn" onClick={() => router.back()}>
              Cancel
            </button>
            {e && !e.is_cancelled ? (
              <button type="button" className="btn" onClick={() => act(e.is_published ? "cancel" : "delete")}>
                {e.is_published ? "Cancel event" : "Delete draft"}
              </button>
            ) : null}
            {!e?.is_published ? (
              <button type="submit" className="btn" value="draft" disabled={saving || locked}>
                Save draft
              </button>
            ) : null}
            <button type="submit" className="btn primary" value="publish" disabled={saving || locked}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : e?.is_published ? "Save changes" : "Publish event"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        {/* Not wired: attachments — events have no attachment field in the API, so the upload box is dropped. */}
        <Panel title="Publishing">
          <dl className="kv">
            <div>
              <dt>Status</dt>
              <dd>{e ? eventStatus(e) : "New draft"}</dd>
            </div>
            <div>
              <dt>Audience</dt>
              <dd>{e?.audience_label || EVENT_AUDIENCE[audience]}</dd>
            </div>
            <div>
              <dt>Published</dt>
              <dd>{e?.published_at ? dateTime(e.published_at) : "—"}</dd>
            </div>
            <div>
              <dt>Consent</dt>
              <dd>{e?.requires_consent ? `${e.consent_yes} yes · ${e.consent_no} no${e.consent_deadline ? ` · by ${date(e.consent_deadline)}` : ""}` : "Not asked"}</dd>
            </div>
            {e?.fee_amount ? (
              <div>
                <dt>Cost</dt>
                <dd>{money(e.fee_amount)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="gap" />
          <p className="muted small">A draft is seen only by staff. Publishing is what notifies the audience.</p>
        </Panel>
      </aside>
    </div>
  );
}
