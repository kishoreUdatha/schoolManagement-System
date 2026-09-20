"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Select, Table, Textarea, humanize, inr, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";
import { openAuthed } from "@/lib/download";

type Opening = {
  id: number;
  reference_no: string;
  title: string;
  department_id: number | null;
  department_name: string | null;
  employment_type: string;
  vacancies: number;
  description: string | null;
  requirements: string | null;
  salary_min: string | null;
  salary_max: string | null;
  status: "draft" | "open" | "on_hold" | "closed" | "filled";
  is_public: boolean;
  posted_on: string | null;
  closes_on: string | null;
  applications: number;
  hired: number;
};
type Interview = {
  id: number;
  round_no: number;
  scheduled_at: string;
  minutes: number;
  mode: string;
  place_or_link: string | null;
  panel_names: string[];
  status: "scheduled" | "done" | "cancelled" | "no_show";
  feedback: string | null;
  rating: number | null;
  recommended: boolean | null;
};
type Offer = {
  id: number;
  role_title: string;
  annual_salary: string;
  joining_date: string;
  valid_till: string | null;
  status: "draft" | "sent" | "accepted" | "declined" | "withdrawn" | "expired";
  terms: string | null;
  response_note: string | null;
};
type Application = {
  id: number;
  opening_id: number;
  opening_title: string;
  candidate_id: number;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string | null;
  qualification: string | null;
  experience_years: string | null;
  has_resume: boolean;
  applied_on: string;
  stage: string;
  rating: number | null;
  notes: string | null;
  rejected_reason: string | null;
  hired_staff_id: number | null;
  interviews: Interview[];
  offer: Offer | null;
};
type Staff = { user_id: number; full_name: string; role: string };
type Dept = { id: number; name: string };

const STAGES = ["applied", "screening", "shortlisted", "interview", "offered", "hired", "rejected", "withdrawn"];
const stageTone: Record<string, "neutral" | "amber" | "brand" | "emerald" | "rose"> = {
  applied: "neutral", screening: "amber", shortlisted: "amber", interview: "brand",
  offered: "brand", hired: "emerald", rejected: "rose", withdrawn: "neutral",
};
const openingTone = { draft: "neutral", open: "emerald", on_hold: "amber", closed: "neutral", filled: "brand" } as const;
const base = "/api/v1/school/hr";
const localInput = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function Recruitment({ canEdit }: { canEdit: boolean }) {
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [openingId, setOpeningId] = useState("");
  const [stage, setStage] = useState("");
  const [detail, setDetail] = useState<Application | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [of, setOf] = useState({ title: "", department_id: "", employment_type: "full_time", vacancies: "1", description: "", requirements: "", salary_min: "", salary_max: "", is_public: true, closes_on: "" });
  const [ivOpen, setIvOpen] = useState(false);
  const [iv, setIv] = useState({ scheduled_at: localInput(), minutes: "45", mode: "in_person", place_or_link: "", panel: [] as number[] });
  const [offerOpen, setOfferOpen] = useState(false);
  const [offer, setOffer] = useState({ role_title: "", annual_salary: "", joining_date: "", valid_till: "", terms: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadOpenings = () => api.get<Opening[]>(`${base}/openings`).then((r) => setOpenings(r.data)).catch((e) => setError(apiError(e)));
  const loadApps = () => {
    const params: Record<string, string> = {};
    if (openingId) params.opening_id = openingId;
    if (stage) params.stage = stage;
    api.get<Application[]>(`${base}/applications`, { params }).then((r) => setApps(r.data)).catch((e) => setError(apiError(e)));
  };

  useEffect(() => {
    loadOpenings();
    api.get<Staff[]>("/api/v1/school/directory/staff").then((r) => setStaff(r.data)).catch(() => setStaff([]));
    api.get<Dept[]>("/api/v1/school/departments").then((r) => setDepts(r.data)).catch(() => setDepts([]));
  }, []);

  useEffect(() => {
    loadApps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingId, stage]);

  async function run(fn: () => Promise<unknown>, done: string, refreshDetail = false) {
    try {
      const r = (await fn()) as { data?: Application };
      setNotice(done);
      setError(null);
      loadOpenings();
      loadApps();
      if (refreshDetail && r?.data && detail) setDetail(r.data);
      return true;
    } catch (e) {
      setError(apiError(e));
      return false;
    }
  }

  const openDetail = async (a: Application) => {
    try {
      const r = await api.get<Application>(`${base}/applications/${a.id}`);
      setDetail(r.data);
    } catch (e) {
      setError(apiError(e));
    }
  };

  async function saveOpening(e: FormEvent) {
    e.preventDefault();
    const body = {
      ...of,
      department_id: of.department_id ? Number(of.department_id) : null,
      vacancies: Number(of.vacancies),
      description: of.description.trim() || null,
      requirements: of.requirements.trim() || null,
      salary_min: of.salary_min || null,
      salary_max: of.salary_max || null,
      closes_on: of.closes_on || null,
    };
    const ok = await run(() => api.post(`${base}/openings`, body), "Opening created as a draft.");
    if (ok) {
      setFormOpen(false);
      setOf({ title: "", department_id: "", employment_type: "full_time", vacancies: "1", description: "", requirements: "", salary_min: "", salary_max: "", is_public: true, closes_on: "" });
    }
  }

  async function schedule(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    const ok = await run(
      () =>
        api.post<Application>(`${base}/applications/${detail.id}/interviews`, {
          scheduled_at: new Date(iv.scheduled_at).toISOString(),
          minutes: Number(iv.minutes),
          mode: iv.mode,
          place_or_link: iv.place_or_link.trim() || null,
          panel_user_ids: iv.panel,
        }),
      "Interview scheduled and the panel told.",
      true
    );
    if (ok) setIvOpen(false);
  }

  async function makeOffer(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    const ok = await run(
      () =>
        api.post<Application>(`${base}/applications/${detail.id}/offer`, {
          role_title: offer.role_title,
          annual_salary: offer.annual_salary,
          joining_date: offer.joining_date,
          valid_till: offer.valid_till || null,
          terms: offer.terms.trim() || null,
        }),
      "Offer drafted.",
      true
    );
    if (ok) setOfferOpen(false);
  }

  const feedback = (i: Interview) => {
    const text = window.prompt("How did the interview go?", i.feedback ?? "");
    if (text === null) return;
    const rating = window.prompt("Rating 1-5 (optional)", i.rating ? String(i.rating) : "");
    const rec = window.confirm("Recommend this candidate? OK = yes, Cancel = no");
    run(
      () => api.put(`${base}/interviews/${i.id}`, { status: "done", feedback: text, rating: rating ? Number(rating) : null, recommended: rec }),
      "Feedback saved."
    ).then(() => detail && openDetail(detail));
  };

  const hire = (a: Application) => {
    const employee_no = window.prompt("Employee number for the new staff member");
    if (!employee_no) return;
    const role = window.prompt("Role: teacher, staff, principal or accountant", "teacher") ?? "teacher";
    run(async () => {
      const r = await api.post<{ temporary_password: string; employee_no: string }>(`${base}/offers/${a.offer!.id}/hire`, { employee_no, role });
      window.alert(`Staff created.\nEmployee no: ${r.data.employee_no}\nTemporary password: ${r.data.temporary_password}\n\nGive this to them — it won't be shown again.`);
    }, "Hired and added to staff.").then(() => setDetail(null));
  };

  return (
    <div className="space-y-6">
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Openings</CardTitle>
            {canEdit && <Button onClick={() => setFormOpen(true)}>New opening</Button>}
          </div>
        </CardHeader>
        <Table head={["Reference", "Role", "Vacancies", "Applications", "Status", ""]} empty={openings.length === 0 && "No openings yet."}>
          {openings.map((o) => (
            <tr key={o.id}>
              <td className={td}>{o.reference_no}</td>
              <td className={tdStrong}>
                {o.title}
                <div className="text-xs font-normal text-ink-subtle">
                  {humanize(o.employment_type)}
                  {o.department_name && ` · ${o.department_name}`}
                  {o.salary_min && ` · ${inr(o.salary_min)}${o.salary_max ? `–${inr(o.salary_max)}` : ""}`}
                  {!o.is_public && " · not on the careers page"}
                </div>
              </td>
              <td className={td}>
                {o.hired}/{o.vacancies}
              </td>
              <td className={td}>
                <button type="button" className="text-brand-500 hover:underline" onClick={() => setOpeningId(String(o.id))}>
                  {o.applications}
                </button>
              </td>
              <td className={td}>
                <Badge tone={openingTone[o.status]}>{humanize(o.status)}</Badge>
              </td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                {canEdit && o.status === "draft" && (
                  <Button size="sm" onClick={() => run(() => api.post(`${base}/openings/${o.id}/status?value=open`), "Opening published.")}>
                    Publish
                  </Button>
                )}
                {canEdit && o.status === "open" && (
                  <Button size="sm" variant="secondary" onClick={() => run(() => api.post(`${base}/openings/${o.id}/status?value=closed`), "Opening closed.")}>
                    Close
                  </Button>
                )}
                {canEdit && o.applications === 0 && (
                  <Button size="sm" variant="ghost" onClick={() => window.confirm(`Delete ${o.title}?`) && run(() => api.delete(`${base}/openings/${o.id}`), "Deleted.")}>
                    Delete
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <CardTitle>Applications</CardTitle>
            <div className="flex items-end gap-2">
              <div className="w-52">
                <Select label="Opening" value={openingId} onChange={(e) => setOpeningId(e.target.value)}>
                  <option value="">All</option>
                  {openings.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-40">
                <Select label="Stage" value={stage} onChange={(e) => setStage(e.target.value)}>
                  <option value="">All</option>
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <Table head={["Candidate", "For", "Applied", "Stage", "Rating", ""]} empty={apps.length === 0 && "No applications."}>
          {apps.map((a) => (
            <tr key={a.id}>
              <td className={tdStrong}>
                {a.candidate_name}
                <div className="text-xs font-normal text-ink-subtle">
                  {a.candidate_email}
                  {a.candidate_phone && ` · ${a.candidate_phone}`}
                  {a.qualification && ` · ${a.qualification}`}
                  {a.experience_years && ` · ${Number(a.experience_years)} yrs`}
                </div>
              </td>
              <td className={td}>{a.opening_title}</td>
              <td className={td}>{a.applied_on}</td>
              <td className={td}>
                <Badge tone={stageTone[a.stage]}>{humanize(a.stage)}</Badge>
              </td>
              <td className={td}>{a.rating ? `${a.rating}/5` : "—"}</td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant="secondary" onClick={() => openDetail(a)}>
                  Open
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.candidate_name} — ${detail.opening_title}` : ""} size="lg">
        {detail && (
          <div className="max-h-[75vh] space-y-4 overflow-auto">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={stageTone[detail.stage]}>{humanize(detail.stage)}</Badge>
              <span className="text-ink-muted">
                {detail.candidate_email}
                {detail.candidate_phone && ` · ${detail.candidate_phone}`}
              </span>
              {detail.has_resume && (
                <button
                  type="button"
                  className="text-brand-500 hover:underline"
                  onClick={() => openAuthed(`${base}/candidates/${detail.candidate_id}/resume`, "resume").catch((e) => setError(apiError(e)))}
                >
                  Download résumé
                </button>
              )}
            </div>
            {detail.notes && <p className="text-sm text-ink">{detail.notes}</p>}
            {detail.rejected_reason && <p className="text-sm text-rose-400">Rejected: {detail.rejected_reason}</p>}

            {canEdit && detail.stage !== "hired" && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-44">
                  <Select
                    label="Move to"
                    value=""
                    onChange={(e) => {
                      const next = e.target.value;
                      if (!next) return;
                      const reason = next === "rejected" ? window.prompt("Why? (required)", "") : null;
                      if (next === "rejected" && !reason) return;
                      run(() => api.post<Application>(`${base}/applications/${detail.id}/stage`, { stage: next, reason }), "Stage updated.", true);
                    }}
                  >
                    <option value="">Choose…</option>
                    {["screening", "shortlisted", "interview", "rejected", "withdrawn"].map((s) => (
                      <option key={s} value={s}>
                        {humanize(s)}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setIvOpen(true)}>
                  Schedule interview
                </Button>
                {!detail.offer && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setOffer({ role_title: detail.opening_title, annual_salary: "", joining_date: "", valid_till: "", terms: "" });
                      setOfferOpen(true);
                    }}
                  >
                    Make an offer
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-sm font-semibold text-ink">Interviews</div>
              {detail.interviews.length === 0 && <p className="text-sm text-ink-subtle">None yet.</p>}
              {detail.interviews.map((i) => (
                <div key={i.id} className="rounded-md border border-surface-border p-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">Round {i.round_no}</span>
                    <Badge tone={i.status === "done" ? "emerald" : i.status === "scheduled" ? "brand" : "neutral"}>{humanize(i.status)}</Badge>
                    <span className="text-xs text-ink-subtle">
                      {new Date(i.scheduled_at).toLocaleString()} · {i.minutes} min · {humanize(i.mode)}
                      {i.place_or_link && ` · ${i.place_or_link}`}
                      {i.panel_names.length > 0 && ` · ${i.panel_names.join(", ")}`}
                    </span>
                    {canEdit && i.status === "scheduled" && (
                      <span className="ml-auto flex gap-2">
                        <button type="button" className="text-xs text-brand-500 hover:underline" onClick={() => feedback(i)}>
                          Add feedback
                        </button>
                        <button type="button" className="text-xs text-rose-400 hover:underline" onClick={() => run(() => api.delete(`${base}/interviews/${i.id}`), "Interview removed.").then(() => openDetail(detail))}>
                          Cancel
                        </button>
                      </span>
                    )}
                  </div>
                  {i.feedback && (
                    <p className="mt-1 text-ink">
                      {i.feedback}
                      {i.rating && ` · ${i.rating}/5`}
                      {i.recommended === true && " · recommended"}
                      {i.recommended === false && " · not recommended"}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {detail.offer && (
              <div className="space-y-2 rounded-md border border-surface-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{detail.offer.role_title}</span>
                  <Badge tone={detail.offer.status === "accepted" ? "emerald" : detail.offer.status === "declined" ? "rose" : "brand"}>
                    {humanize(detail.offer.status)}
                  </Badge>
                  <span className="text-ink-muted">
                    {inr(detail.offer.annual_salary)} a year · joins {detail.offer.joining_date}
                    {detail.offer.valid_till && ` · reply by ${detail.offer.valid_till}`}
                  </span>
                </div>
                {detail.offer.terms && <p className="text-ink-muted">{detail.offer.terms}</p>}
                {detail.offer.response_note && <p className="text-ink-subtle">{detail.offer.response_note}</p>}
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    {detail.offer.status === "draft" && (
                      <Button size="sm" onClick={() => run(() => api.post(`${base}/offers/${detail.offer!.id}/send`), "Offer marked as sent.").then(() => openDetail(detail))}>
                        Mark as sent
                      </Button>
                    )}
                    {(detail.offer.status === "sent" || detail.offer.status === "draft") && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const note = window.prompt("Note (optional)", "") ?? "";
                            run(() => api.post(`${base}/offers/${detail.offer!.id}/respond`, { accept: true, note: note || null }), "Marked as accepted.").then(() => openDetail(detail));
                          }}
                        >
                          Candidate accepted
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const note = window.prompt("Why did they decline?", "") ?? "";
                            run(() => api.post(`${base}/offers/${detail.offer!.id}/respond`, { accept: false, note: note || null }), "Marked as declined.").then(() => openDetail(detail));
                          }}
                        >
                          Candidate declined
                        </Button>
                      </>
                    )}
                    {detail.offer.status === "accepted" && !detail.hired_staff_id && (
                      <Button size="sm" onClick={() => hire(detail)}>
                        Add to staff
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="New opening" size="lg">
        <form onSubmit={saveOpening} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Role *" value={of.title} onChange={(e) => setOf({ ...of, title: e.target.value })} required minLength={2} />
            <Select label="Department" value={of.department_id} onChange={(e) => setOf({ ...of, department_id: e.target.value })}>
              <option value="">None</option>
              {depts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select label="Type" value={of.employment_type} onChange={(e) => setOf({ ...of, employment_type: e.target.value })}>
              {["full_time", "part_time", "contract", "temporary"].map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </Select>
            <Input label="Vacancies" type="number" min={1} value={of.vacancies} onChange={(e) => setOf({ ...of, vacancies: e.target.value })} />
            <Input label="Salary from" type="number" min={0} value={of.salary_min} onChange={(e) => setOf({ ...of, salary_min: e.target.value })} />
            <Input label="Salary to" type="number" min={0} value={of.salary_max} onChange={(e) => setOf({ ...of, salary_max: e.target.value })} />
            <Input label="Applications close" type="date" value={of.closes_on} onChange={(e) => setOf({ ...of, closes_on: e.target.value })} />
          </div>
          <Textarea label="About the role" rows={3} value={of.description} onChange={(e) => setOf({ ...of, description: e.target.value })} />
          <Textarea label="What we're looking for" rows={3} value={of.requirements} onChange={(e) => setOf({ ...of, requirements: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={of.is_public} onChange={(e) => setOf({ ...of, is_public: e.target.checked })} />
            Show on the public careers page once published
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save draft</Button>
          </div>
        </form>
      </Modal>

      <Modal open={ivOpen} onClose={() => setIvOpen(false)} title="Schedule an interview">
        <form onSubmit={schedule} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="When *" type="datetime-local" value={iv.scheduled_at} onChange={(e) => setIv({ ...iv, scheduled_at: e.target.value })} required />
            <Input label="Minutes" type="number" min={5} max={480} value={iv.minutes} onChange={(e) => setIv({ ...iv, minutes: e.target.value })} />
            <Select label="Mode" value={iv.mode} onChange={(e) => setIv({ ...iv, mode: e.target.value })}>
              <option value="in_person">In person</option>
              <option value="phone">Phone</option>
              <option value="video">Video call</option>
            </Select>
            <Input label={iv.mode === "video" ? "Meeting link" : "Where"} value={iv.place_or_link} onChange={(e) => setIv({ ...iv, place_or_link: e.target.value })} />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-ink">Panel</div>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-auto">
              {staff.map((s) => (
                <label key={s.user_id} className="flex items-center gap-1 rounded-md border border-surface-border px-2 py-1 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={iv.panel.includes(s.user_id)}
                    onChange={(e) => setIv({ ...iv, panel: e.target.checked ? [...iv.panel, s.user_id] : iv.panel.filter((x) => x !== s.user_id) })}
                  />
                  {s.full_name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIvOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Schedule</Button>
          </div>
        </form>
      </Modal>

      <Modal open={offerOpen} onClose={() => setOfferOpen(false)} title="Make an offer">
        <form onSubmit={makeOffer} className="space-y-3">
          <Input label="Role title *" value={offer.role_title} onChange={(e) => setOffer({ ...offer, role_title: e.target.value })} required />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Salary a year *" type="number" min={1} value={offer.annual_salary} onChange={(e) => setOffer({ ...offer, annual_salary: e.target.value })} required />
            <Input label="Joining date *" type="date" value={offer.joining_date} onChange={(e) => setOffer({ ...offer, joining_date: e.target.value })} required />
            <Input label="Reply by" type="date" value={offer.valid_till} onChange={(e) => setOffer({ ...offer, valid_till: e.target.value })} />
          </div>
          <Textarea label="Terms" rows={3} value={offer.terms} onChange={(e) => setOffer({ ...offer, terms: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOfferOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save offer</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
