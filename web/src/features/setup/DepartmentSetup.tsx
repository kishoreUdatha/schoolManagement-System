"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Panel } from "@/components/ui/primitives";
import { Field, SectionTitle, orNull } from "./bits";
import type { AcademicYear, Branch, Department, StaffPick } from "./types";

/** What most schools set up. Picking one fills the name and code, which stay
    editable — a school's own department is simply typed in instead. */
const COMMON: [string, string][] = [
  ["Pre-Primary (Montessori)", "PREP"],
  ["Primary", "PRIM"],
  ["Middle School", "MID"],
  ["Senior School", "SEN"],
  ["Languages", "LANG"],
  ["Mathematics", "MATH"],
  ["Science", "SCI"],
  ["Social Studies", "SOC"],
  ["Computer Science", "CS"],
  ["Arts & Crafts", "ART"],
  ["Music & Dance", "MUS"],
  ["Physical Education", "PE"],
  ["Administration", "ADMIN"],
  ["Accounts & Finance", "ACC"],
  ["Front Office", "FO"],
  ["Admissions", "ADM"],
  ["Library", "LIB"],
  ["Transport", "TRANS"],
  ["Housekeeping & Maintenance", "MAINT"],
  ["Security", "SEC"],
  ["Health & Wellness", "HLTH"],
  ["IT Support", "IT"],
];

/**
 * SCR-031 and NEW-085 (the school admin's own menu entry), live. POST
 * /departments to add, PUT /departments/{id} (?id=) to edit. The PUT replaces
 * the whole record, so every field is sent. Its own links stay on whichever
 * of the two screens the user opened.
 */
export function DepartmentSetup() {
  const router = useRouter();
  const here = usePathname();
  const id = useSearchParams().get("id");
  const depts = useApi<Department[]>("/api/v1/school/departments");
  const staff = useApi<StaffPick[]>("/api/v1/school/directory/staff");
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const branches = useApi<Branch[]>("/api/v1/school/branches");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingCommon, setAddingCommon] = useState(false);
  // the usual departments the school does not have yet, by name or code
  const missing = COMMON.filter(([n, c]) => !depts.data?.some((d) => d.name.trim().toLowerCase() === n.toLowerCase() || d.code.toUpperCase() === c));
  async function addCommon() {
    setAddingCommon(true);
    setError(null);
    try {
      const r = await api.post<{ added: number }>("/api/v1/school/departments/common");
      notify(`${r.added} departments added.`);
      depts.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setAddingCommon(false);
    }
  }
  // name and code follow the picker, and can be typed over
  const [name, setName] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  // a different record (or a new one): back to what it holds
  useEffect(() => {
    setName(null);
    setCode(null);
  }, [id]);

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
      email: orNull(f.get("email")),
      phone: orNull(f.get("phone")),
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
        router.replace(`${here}?id=${created.id}`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <form id="department-form" key={dept?.id ?? "new"} className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? depts.error ?? (id && depts.data && !dept ? "That department was not found." : null)}</ErrorNote>
          <div className="form-sections">
            <section>
              <SectionTitle n="01">{dept ? `Edit ${dept.name}` : "Details"}</SectionTitle>
              <div className="form-grid">
                {!dept ? (
                  <Field label="Common department">
                    <select
                      aria-label="Common departments"
                      value=""
                      onChange={(e) => {
                        const pick = COMMON.find(([n]) => n === e.target.value);
                        if (!pick) return;
                        setName(pick[0]);
                        setCode(pick[1]);
                      }}
                    >
                      <option value="">Choose one, or type your own</option>
                      {COMMON.filter(([n]) => !depts.data?.some((d) => d.name.toLowerCase() === n.toLowerCase())).map(([n, c]) => (
                        <option key={c} value={n}>
                          {`${n} · ${c}`}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                <Field label="Department name" required>
                  <input type="text" name="name" required minLength={2} placeholder="Enter department name" value={name ?? dept?.name ?? ""} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Department code" required>
                  <input type="text" name="code" required placeholder="Enter department code" value={code ?? dept?.code ?? ""} onChange={(e) => setCode(e.target.value)} />
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
                <Field label="Email address">
                  <input type="email" name="email" placeholder="Enter email address" defaultValue={dept?.email ?? ""} />
                </Field>
                <Field label="Phone">
                  <input type="tel" name="phone" maxLength={20} placeholder="Enter phone" defaultValue={dept?.phone ?? ""} />
                </Field>
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
      <Panel
        title={`Departments (${depts.data?.length ?? 0})`}
        sub={dept ? `${dept.staff_count} staff and ${dept.subject_count} subjects belong to ${dept.name}` : undefined}
        action={
          dept ? (
            <Link href={here} className="btn">
              <Icon name="plus" className="sm" />
              New department
            </Link>
          ) : missing.length ? (
            <button type="button" className="btn" disabled={addingCommon} onClick={addCommon} title={missing.map(([n]) => n).join(", ")}>
              <Icon name="plus" className="sm" />
              {addingCommon ? "Adding…" : `Add ${missing.length} common departments`}
            </button>
          ) : undefined
        }
      >
        {depts.data?.length ? (
          <div className="dept-list">
            {depts.data.map((d) => (
              <Link key={d.id} href={`${here}?id=${d.id}`} className={`dept-row ${String(d.id) === id ? "on" : ""}`}>
                <strong>{d.name}</strong>
                <span className="muted">{d.code}</span>
                <small className="muted">{d.head_name ?? "No head"}</small>
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted">No departments yet.</p>
        )}
      </Panel>
    </div>
  );
}
