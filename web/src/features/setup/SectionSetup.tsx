"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field, KV, SectionTitle, orNull } from "./bits";
import { useSetupYear } from "./ClassSetup";
import type { Branch, Section, StaffMember } from "./types";

/**
 * SCR-030, live. POST /classes/{class_id}/sections creates a section (name
 * and capacity); the class teacher is then set with PATCH /sections/{id},
 * which is also how an existing section (?id=&year=) is edited.
 */
export function SectionSetup() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const { years, yearId, setYearId, classes, year } = useSetupYear();
  const teachers = useApi<StaffMember[]>("/api/v1/school/staff", { role: "teacher", status: "active" });
  const branches = useApi<Branch[]>("/api/v1/school/branches");
  const [classId, setClassId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = (classes.data ?? []).flatMap((c) => c.sections.map((s) => ({ ...s, class_name: c.name })));
  const section = id ? all.find((s) => String(s.id) === id) : undefined;

  // Editing: the class is the section's own. Adding: the first class of the year.
  useEffect(() => {
    if (section) setClassId(section.class_id);
    else if (classes.data && !classes.data.some((c) => c.id === classId)) setClassId(classes.data[0]?.id ?? null);
  }, [section, classes.data, classId]);

  if (years.loading && !years.data) return <Loading what="Loading sections…" />;
  const main = branches.data?.find((b) => b.is_main);
  const go = (sectionId: number | null, y = yearId) => router.replace(`${routeOf(30)}?${sectionId ? `id=${sectionId}&` : ""}year=${y}`);
  const teacherName = (uid: number | null) => teachers.data?.find((t) => t.user_id === uid)?.full_name;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    const capacity = Number(f.get("capacity") || 40);
    const teacher = orNull(f.get("class_teacher_user_id"));
    const class_teacher_user_id = teacher ? Number(teacher) : null;
    if (!classId) {
      setError("Choose a class.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (section) {
        await api.patch(`/api/v1/school/sections/${section.id}`, { name, capacity, class_teacher_user_id });
        notify(`Section ${name} saved.`);
        await classes.reload();
        return;
      }
      const created = await api.post<Section>(`/api/v1/school/classes/${classId}/sections`, { name, capacity });
      if (class_teacher_user_id) {
        try {
          await api.patch(`/api/v1/school/sections/${created.id}`, { class_teacher_user_id });
        } catch (err) {
          // The section exists; say what did not save rather than hide it.
          notify(`Section created, but the class teacher was not set: ${errorText(err)}`);
          await classes.reload();
          go(created.id);
          return;
        }
      }
      notify(`Section ${created.name} created.`);
      await classes.reload();
      go(created.id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!section || !window.confirm(`Delete section ${section.class_name} ${section.name}?`)) return;
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/api/v1/school/sections/${section.id}`);
      notify(`Section ${section.name} deleted.`);
      await classes.reload();
      go(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="two-col">
      <form id="section-form" key={section?.id ?? `new-${yearId}`} className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? years.error ?? classes.error ?? (id && classes.data && !section ? "That section is not in this academic year." : null)}</ErrorNote>
          <div className="form-sections">
            <section>
              <SectionTitle n="01">{section ? `Edit ${section.class_name} ${section.name}` : "Details"}</SectionTitle>
              <div className="form-grid">
                <Field label="Section name" required>
                  <input type="text" name="name" required placeholder="Enter section name" defaultValue={section?.name ?? ""} />
                </Field>
                <Field label="Class" required>
                  <select aria-label="Class" required value={classId ?? ""} disabled={Boolean(section)} onChange={(e) => setClassId(Number(e.target.value))}>
                    {!classes.data?.length ? <option value="">{classes.loading ? "Loading classes…" : "Add a class first"}</option> : null}
                    {classes.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Academic year" required>
                  <select
                    aria-label="Academic year"
                    value={yearId ?? ""}
                    disabled={Boolean(section)}
                    onChange={(e) => {
                      setYearId(Number(e.target.value));
                      go(null, Number(e.target.value));
                    }}
                  >
                    {years.data?.map((y) => (
                      <option key={y.id} value={y.id}>
                        {`${y.name}${y.is_current ? " (current)" : ""}`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Class teacher">
                  <select name="class_teacher_user_id" aria-label="Class teacher" defaultValue={section?.class_teacher_user_id ?? ""}>
                    <option value="">{teachers.loading ? "Loading teachers…" : "No class teacher"}</option>
                    {teachers.data?.map((t) => (
                      <option key={t.user_id} value={t.user_id}>
                        {t.full_name}
                      </option>
                    ))}
                  </select>
                </Field>
                {/* Not wired: Room — a section has no room; no endpoint */}
                <Field label="Student capacity">
                  <input type="number" name="capacity" min={1} max={200} defaultValue={section?.capacity ?? 40} />
                </Field>
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            {section ? (
              <button type="button" className="btn" onClick={remove} disabled={saving}>
                Delete
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => router.back()}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving || !classId}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save section"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>School setup</h3>
          <KV
            rows={[
              ["Academic year", year?.name ?? "—"],
              ["Branch", main?.name ?? "Whole school"],
              ["Status", section ? `Capacity ${section.capacity}` : "New section"],
            ]}
          />
          <div className="gap" />
          <p>Subjects and their teachers are assigned per class under Academics.</p>
        </div>
        <div className="aside-panel">
          <h3>{`Sections in ${year?.name ?? "this year"} (${all.length})`}</h3>
          {all.length ? (
            all.map((s) => (
              <div className="spread" key={s.id} style={{ padding: "6px 0" }}>
                <Link href={`${routeOf(30)}?id=${s.id}&year=${yearId}`}>{`${s.class_name} ${s.name}`}</Link>
                <small className="muted">{teacherName(s.class_teacher_user_id) ?? "No class teacher"}</small>
              </div>
            ))
          ) : (
            <p className="muted">{classes.loading ? "Loading…" : "No sections in this year yet."}</p>
          )}
          {section ? (
            <>
              <div className="gap" />
              <Link href={`${routeOf(30)}?year=${yearId}`} className="btn">
                <Icon name="plus" className="sm" />
                New section
              </Link>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
