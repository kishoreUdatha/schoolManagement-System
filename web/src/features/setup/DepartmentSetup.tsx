"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field, KV, SectionTitle, orNull } from "./bits";
import type { AcademicYear, Branch, Department, StaffPick } from "./types";

/**
 * SCR-031, live. POST /departments to add, PUT /departments/{id} (?id=) to
 * edit. The PUT replaces the whole record, so every field is sent.
 */
export function DepartmentSetup() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const depts = useApi<Department[]>("/api/v1/school/departments");
  const staff = useApi<StaffPick[]>("/api/v1/school/directory/staff");
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const branches = useApi<Branch[]>("/api/v1/school/branches");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (depts.loading && !depts.data) return <Loading what="Loading departments…" />;
  const dept = id ? depts.data?.find((d) => String(d.id) === id) : undefined;
  const current = years.data?.find((y) => y.is_current);
  const main = branches.data?.find((b) => b.is_main);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const head = orNull(f.get("head_user_id"));
    const body = {
      name: String(f.get("name") ?? "").trim(),
      code: String(f.get("code") ?? "").trim().toUpperCase(),
      head_user_id: head ? Number(head) : null,
      is_active: f.get("status") !== "inactive",
    };
    setSaving(true);
    setError(null);
    try {
      if (dept) {
        await api.put(`/api/v1/school/departments/${dept.id}`, body);
        notify(`${body.name} saved.`);
        await depts.reload();
      } else {
        const created = await api.post<Department>("/api/v1/school/departments", body);
        notify(`${created.name} created.`);
        await depts.reload();
        router.replace(`${routeOf(31)}?id=${created.id}`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="two-col">
      <form id="department-form" key={dept?.id ?? "new"} className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? depts.error ?? (id && depts.data && !dept ? "That department was not found." : null)}</ErrorNote>
          <div className="form-sections">
            <section>
              <SectionTitle n="01">{dept ? `Edit ${dept.name}` : "Details"}</SectionTitle>
              <div className="form-grid">
                <Field label="Department name" required>
                  <input type="text" name="name" required minLength={2} placeholder="Enter department name" defaultValue={dept?.name ?? ""} />
                </Field>
                <Field label="Department code" required>
                  <input type="text" name="code" required placeholder="Enter department code" defaultValue={dept?.code ?? ""} />
                </Field>
                <Field label="Head of department">
                  <select name="head_user_id" aria-label="Head of department" defaultValue={dept?.head_user_id ?? ""}>
                    <option value="">{staff.loading ? "Loading staff…" : "No head yet"}</option>
                    {staff.data?.map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {`${s.full_name} · ${label(s.role)}`}
                      </option>
                    ))}
                  </select>
                </Field>
                {/* Not wired: Email address and Phone — departments have no contact fields; no endpoint */}
                <Field label="Status">
                  <select name="status" aria-label="Status" defaultValue={dept && !dept.is_active ? "inactive" : "active"}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </Field>
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
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save department"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>School setup</h3>
          <KV
            rows={[
              ["Academic year", current?.name ?? "—"],
              ["Branch", main?.name ?? "Whole school"],
              ["Status", dept ? (dept.is_active ? "Active" : "Inactive") : "New"],
            ]}
          />
          <div className="gap" />
          <p>{dept ? `${dept.staff_count} staff and ${dept.subject_count} subjects belong to ${dept.name}.` : "Review the information, then save your changes."}</p>
        </div>
        <div className="aside-panel">
          <h3>{`Departments (${depts.data?.length ?? 0})`}</h3>
          {depts.data?.length ? (
            depts.data.map((d) => (
              <div className="spread" key={d.id} style={{ padding: "6px 0" }}>
                <Link href={`${routeOf(31)}?id=${d.id}`} className={String(d.id) === id ? "active" : ""}>
                  {`${d.name} · ${d.code}`}
                </Link>
                <small className="muted">{d.head_name ?? "No head"}</small>
              </div>
            ))
          ) : (
            <p className="muted">No departments yet.</p>
          )}
          {dept ? (
            <>
              <div className="gap" />
              <Link href={routeOf(31)} className="btn">
                <Icon name="plus" className="sm" />
                New department
              </Link>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
