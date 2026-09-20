"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

type Audience = "class_parents" | "section_parents" | "single_parent";

type SectionBrief = {
  section_id: number;
  section_name: string;
  student_count: number;
};

type ClassTeacherCard = {
  section_id: number;
  class_id: number;
  section_name: string;
  class_name: string;
  section_label: string;
};

type SubjectTeacherCard = {
  class_subject_id: number;
  class_id: number;
  class_name: string;
  subject_name: string;
  subject_code: string;
  sections: SectionBrief[];
};

type MyClasses = {
  class_teacher_of: ClassTeacherCard[];
  subject_teacher_of: SubjectTeacherCard[];
};

type RosterStudent = {
  student_id: number;
  admission_no: string;
  roll_no: number;
  full_name: string;
};

type Notice = {
  id: number;
  title: string;
  body: string;
  audience: Audience | "all_parents" | "all_teachers" | "all_staff";
  audience_class_name: string | null;
  audience_section_label: string | null;
  audience_student_label: string | null;
  attachment_url: string | null;
  sent_at: string | null;
  status: "draft" | "scheduled" | "sent" | "failed";
  recipient_count: number;
  created_at: string;
};

type ClassOption = { class_id: number; class_name: string };
type SectionOption = {
  section_id: number;
  label: string;
  class_id: number;
};

export default function TeacherNoticesPage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [items, setItems] = useState<Notice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get<MyClasses>("/api/v1/teacher/my-classes")
      .then((r) => {
        const classMap = new Map<number, ClassOption>();
        const sectionMap = new Map<number, SectionOption>();
        for (const c of r.data.class_teacher_of) {
          classMap.set(c.class_id, {
            class_id: c.class_id,
            class_name: c.class_name,
          });
          sectionMap.set(c.section_id, {
            section_id: c.section_id,
            label: c.section_label,
            class_id: c.class_id,
          });
        }
        for (const cs of r.data.subject_teacher_of) {
          classMap.set(cs.class_id, {
            class_id: cs.class_id,
            class_name: cs.class_name,
          });
          for (const s of cs.sections) {
            sectionMap.set(s.section_id, {
              section_id: s.section_id,
              label: `${cs.class_name} ${s.section_name}`,
              class_id: cs.class_id,
            });
          }
        }
        setClasses(
          Array.from(classMap.values()).sort((a, b) =>
            a.class_name.localeCompare(b.class_name)
          )
        );
        setSections(
          Array.from(sectionMap.values()).sort((a, b) =>
            a.label.localeCompare(b.label)
          )
        );
      })
      .catch((e) => setError(apiError(e)));
  }, []);

  async function load() {
    try {
      const { data } = await api.get<Notice[]>("/api/v1/teacher/notices");
      setItems(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Notices</h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Send in-app notices to parents of the classes, sections, or students
          you teach. They land in the parent inbox immediately.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">
          {notice}
        </div>
      )}

      <Composer
        classes={classes}
        sections={sections}
        onSent={(msg) => {
          setNotice(msg);
          setError(null);
          load();
        }}
        onError={(msg) => {
          setError(msg);
          setNotice(null);
        }}
      />

      <SentList items={items} loaded={loaded} />
    </div>
  );
}

function Composer({
  classes,
  sections,
  onSent,
  onError,
}: {
  classes: ClassOption[];
  sections: SectionOption[];
  onSent: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [audience, setAudience] = useState<Audience>("class_parents");
  const [classId, setClassId] = useState<number | "">("");
  const [sectionId, setSectionId] = useState<number | "">("");
  const [studentId, setStudentId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  // Default first option whenever lists arrive
  useEffect(() => {
    if (classId === "" && classes.length > 0) setClassId(classes[0].class_id);
  }, [classes, classId]);
  useEffect(() => {
    if (sectionId === "" && sections.length > 0)
      setSectionId(sections[0].section_id);
  }, [sections, sectionId]);

  // For single_parent: load roster of the picked section
  useEffect(() => {
    if (audience !== "single_parent" || sectionId === "") {
      setRoster([]);
      setStudentId("");
      return;
    }
    setRosterLoading(true);
    api
      .get<RosterStudent[]>(`/api/v1/teacher/sections/${sectionId}/students`)
      .then((r) => {
        setRoster(r.data);
        setStudentId(r.data[0]?.student_id ?? "");
      })
      .catch((e) => onError(apiError(e)))
      .finally(() => setRosterLoading(false));
    // onError intentionally omitted from deps — stable per render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, sectionId]);

  const canSubmit = useMemo(() => {
    if (!title.trim() || !body.trim()) return false;
    if (audience === "class_parents") return classId !== "";
    if (audience === "section_parents") return sectionId !== "";
    if (audience === "single_parent") return studentId !== "";
    return false;
  }, [title, body, audience, classId, sectionId, studentId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim(),
        audience,
        attachment_url: attachment.trim() || null,
      };
      if (audience === "class_parents") payload.audience_class_id = classId;
      if (audience === "section_parents")
        payload.audience_section_id = sectionId;
      if (audience === "single_parent") payload.audience_student_id = studentId;
      const { data } = await api.post<Notice>("/api/v1/teacher/notices", payload);
      onSent(
        `Sent to ${data.recipient_count} parent${
          data.recipient_count === 1 ? "" : "s"
        }.`
      );
      setTitle("");
      setBody("");
      setAttachment("");
    } catch (e) {
      onError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  const noClasses = classes.length === 0;

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-slate-900">New notice</h2>
      {noClasses ? (
        <p className="mt-3 text-sm text-slate-500">
          You aren&apos;t assigned to any class yet, so there&apos;s no audience
          to message. Ask your school admin to assign you in Classes or
          Subjects.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-muted">
                Audience *
              </span>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as Audience)}
                className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
              >
                <option value="class_parents">All parents in a class</option>
                <option value="section_parents">
                  Parents in one section
                </option>
                <option value="single_parent">One student&apos;s parents</option>
              </select>
            </label>

            {audience === "class_parents" && (
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-bold text-ink-muted">
                  Class *
                </span>
                <select
                  value={classId}
                  onChange={(e) => setClassId(Number(e.target.value))}
                  className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
                  required
                >
                  {classes.map((c) => (
                    <option key={c.class_id} value={c.class_id}>
                      {c.class_name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {audience === "section_parents" && (
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-bold text-ink-muted">
                  Section *
                </span>
                <select
                  value={sectionId}
                  onChange={(e) => setSectionId(Number(e.target.value))}
                  className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
                  required
                >
                  {sections.map((s) => (
                    <option key={s.section_id} value={s.section_id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {audience === "single_parent" && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-bold text-ink-muted">
                    Section *
                  </span>
                  <select
                    value={sectionId}
                    onChange={(e) => setSectionId(Number(e.target.value))}
                    className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
                    required
                  >
                    {sections.map((s) => (
                      <option key={s.section_id} value={s.section_id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-[12px] font-bold text-ink-muted">
                    Student *
                  </span>
                  <select
                    value={studentId}
                    onChange={(e) => setStudentId(Number(e.target.value))}
                    className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
                    required
                    disabled={rosterLoading || roster.length === 0}
                  >
                    {rosterLoading && <option>Loading…</option>}
                    {!rosterLoading && roster.length === 0 && (
                      <option value="">No students in this section</option>
                    )}
                    {roster.map((s) => (
                      <option key={s.student_id} value={s.student_id}>
                        #{s.roll_no} · {s.full_name} ({s.admission_no})
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>

          <Input
            label="Title *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
          />

          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Body *</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              required
              className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </label>

          <Input
            label="Attachment URL"
            value={attachment}
            onChange={(e) => setAttachment(e.target.value)}
            placeholder="https://…"
          />

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Delivered in-app to the parent inbox. No SMS / email from the
              teacher portal.
            </p>
            <Button type="submit" loading={submitting} disabled={!canSubmit}>
              Send notice
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function audienceLabel(n: Notice): string {
  if (n.audience === "class_parents")
    return `Class · ${n.audience_class_name ?? ""}`.trim();
  if (n.audience === "section_parents")
    return `Section · ${n.audience_section_label ?? ""}`.trim();
  if (n.audience === "single_parent")
    return `Student · ${n.audience_student_label ?? ""}`.trim();
  return n.audience;
}

function SentList({ items, loaded }: { items: Notice[]; loaded: boolean }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Notices you&apos;ve sent
      </h2>
      {!loaded ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">
          You haven&apos;t sent any notices yet.
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <Card key={n.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{n.title}</h3>
                    <Badge tone="brand">{audienceLabel(n)}</Badge>
                    {n.status === "sent" ? (
                      <Badge tone="emerald">
                        sent · {n.recipient_count}{" "}
                        {n.recipient_count === 1 ? "parent" : "parents"}
                      </Badge>
                    ) : (
                      <Badge tone="amber">{n.status}</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {n.sent_at
                      ? `Sent ${new Date(n.sent_at).toLocaleString()}`
                      : `Created ${new Date(n.created_at).toLocaleString()}`}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
                    {n.body}
                  </p>
                  {n.attachment_url && (
                    <a
                      href={n.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs text-brand-700 hover:underline"
                    >
                      Attachment →
                    </a>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
