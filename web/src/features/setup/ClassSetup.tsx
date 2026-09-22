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
import type { AcademicYear, Branch, SchoolClass, StaffPick } from "./types";

import { ask } from "@/lib/dialog";
export const SCHOOL_LEVELS = ["Pre-primary", "Primary", "Middle school", "Secondary", "Senior secondary"];

/**
 * Class code, school level, capacity, coordinator and status — the class's
 * own details beyond name and order. Shared by Class Setup and Grades/Classes.
 */
export function ClassDetailFields({ c }: { c?: SchoolClass }) {
  const staff = useApi<StaffPick[]>("/api/v1/school/directory/staff");
  const levels = c?.school_level && !SCHOOL_LEVELS.includes(c.school_level) ? [...SCHOOL_LEVELS, c.school_level] : SCHOOL_LEVELS;
  return (
    <>
      <Field label="Class code">
        <input type="text" name="code" maxLength={20} placeholder="e.g. G8" defaultValue={c?.code ?? ""} />
      </Field>
      <Field label="School level">
        <select name="school_level" aria-label="School level" defaultValue={c?.school_level ?? ""}>
          <option value="">Not set</option>
          {levels.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </Field>
      <Field label="Student capacity">
        <input type="number" name="capacity" min={0} max={5000} placeholder="Whole class" defaultValue={c?.capacity ?? ""} />
      </Field>
      <Field label="Class coordinator">
        <select name="coordinator_user_id" aria-label="Class coordinator" defaultValue={c?.coordinator_user_id ?? ""} key={staff.data ? "ready" : "loading"}>
          <option value="">{staff.loading ? "Loading staff…" : "No coordinator"}</option>
          {staff.data?.map((s) => (
            <option key={s.user_id} value={s.user_id}>
              {s.full_name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Status">
        <select name="class_status" aria-label="Status" defaultValue={c && !c.is_active ? "inactive" : "active"}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </Field>
    </>
  );
}

/** Reads ClassDetailFields back into the API's shape. */
export function classDetails(f: FormData) {
  const capacity = orNull(f.get("capacity"));
  const coordinator = orNull(f.get("coordinator_user_id"));
  return {
    code: orNull(f.get("code")),
    school_level: orNull(f.get("school_level")),
    capacity: capacity === null ? null : Number(capacity),
    coordinator_user_id: coordinator === null ? null : Number(coordinator),
    is_active: f.get("class_status") !== "inactive",
  };
}

/** Year chosen by ?year=, else the current one. Shared by class and section setup. */
export function useSetupYear() {
  const params = useSearchParams();
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const [yearId, setYearId] = useState<number | null>(params.get("year") ? Number(params.get("year")) : null);
  useEffect(() => {
    if (yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  return { years, yearId, setYearId, classes, year: years.data?.find((y) => y.id === yearId) };
}

/**
 * SCR-029, live. POST /classes to add a class to a year; PATCH and DELETE
 * /classes/{id} (?id=&year=) to rename, reorder or remove it.
 */
export function ClassSetup() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const { years, yearId, setYearId, classes, year } = useSetupYear();
  const branches = useApi<Branch[]>("/api/v1/school/branches");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (years.loading && !years.data) return <Loading what="Loading classes…" />;
  const cls = id ? classes.data?.find((c) => String(c.id) === id) : undefined;
  const main = branches.data?.find((b) => b.is_main);
  const go = (classId: number | null, y = yearId) => router.replace(`${routeOf(29)}?${classId ? `id=${classId}&` : ""}year=${y}`);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    const order = String(f.get("display_order") ?? "").trim();
    setSaving(true);
    setError(null);
    try {
      if (cls) {
        await api.patch(`/api/v1/school/classes/${cls.id}`, { name, ...classDetails(f), ...(order ? { display_order: Number(order) } : {}) });
        notify(`${name} saved.`);
        await classes.reload();
      } else {
        const created = await api.post<SchoolClass>("/api/v1/school/classes", {
          academic_year_id: yearId,
          name,
          ...classDetails(f),
          ...(order ? { display_order: Number(order) } : {}),
        });
        notify(`${created.name} created.`);
        await classes.reload();
        go(created.id);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!cls || !(await ask(`Delete ${cls.name}? Its sections go with it.`))) return;
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/api/v1/school/classes/${cls.id}`);
      notify(`${cls.name} deleted.`);
      await classes.reload();
      go(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const list = classes.data ?? [];

  return (
    <div className="two-col">
      <form id="class-form" key={cls?.id ?? `new-${yearId}`} className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? years.error ?? classes.error ?? (id && classes.data && !cls ? "That class is not in this academic year." : null)}</ErrorNote>
          <div className="form-sections">
            <section>
              <SectionTitle n="01">{cls ? `Edit ${cls.name}` : "Details"}</SectionTitle>
              <div className="form-grid">
                <Field label="Class name" required>
                  <input type="text" name="name" required minLength={1} placeholder="Enter class name" defaultValue={cls?.name ?? ""} />
                </Field>
                <Field label="Academic year" required>
                  <select
                    aria-label="Academic year"
                    value={yearId ?? ""}
                    disabled={Boolean(cls)}
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
                <Field label="Display order">
                  <input type="number" name="display_order" min={0} placeholder="Position in lists" defaultValue={cls?.display_order ?? ""} />
                </Field>
                <ClassDetailFields c={cls} />
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            {cls ? (
              <button type="button" className="btn" onClick={remove} disabled={saving}>
                Delete
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => router.back()}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving || !yearId}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save class"}
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
              ["Status", cls ? `${cls.is_active ? "Active" : "Inactive"} · ${cls.sections.length} sections` : "New class"],
            ]}
          />
          <div className="gap" />
          <p>Classes belong to one academic year. Each section&apos;s own capacity and class teacher are set under Section Setup.</p>
        </div>
        <div className="aside-panel">
          <h3>{`Classes in ${year?.name ?? "this year"} (${list.length})`}</h3>
          {list.length ? (
            list.map((c) => (
              <div className="spread" key={c.id} style={{ padding: "6px 0" }}>
                <Link href={`${routeOf(29)}?id=${c.id}&year=${yearId}`}>{c.name}</Link>
                <small className="muted">{c.sections.map((s) => s.name).join(", ") || "No sections"}</small>
              </div>
            ))
          ) : (
            <p className="muted">{classes.loading ? "Loading…" : "No classes in this year yet."}</p>
          )}
          {cls ? (
            <>
              <div className="gap" />
              <Link href={`${routeOf(29)}?year=${yearId}`} className="btn">
                <Icon name="plus" className="sm" />
                New class
              </Link>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
