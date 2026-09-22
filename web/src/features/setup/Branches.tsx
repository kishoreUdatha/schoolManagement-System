"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field, KV, SectionTitle, count, orNull } from "./bits";
import type { AcademicYear, AuditEntry, Branch, SchoolClass, SchoolProfile, StaffMember, StaffPick } from "./types";

import { ask } from "@/lib/dialog";
const BRANCHES = "/api/v1/school/branches";

/** SCR-025, live: GET /api/v1/school/branches, searched and filtered here (the list is not paged). */
export function BranchesList() {
  const router = useRouter();
  const list = useApi<Branch[]>(BRANCHES);
  const school = useApi<SchoolProfile>("/api/v1/school/profile");
  const [typed, setTyped] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");

  const items = useMemo(() => {
    const q = typed.trim().toLowerCase();
    return (list.data ?? []).filter(
      (b) =>
        (!q || [b.name, b.code, b.head_name ?? ""].some((v) => v.toLowerCase().includes(q))) &&
        (!kind || (kind === "main") === b.is_main) &&
        (!status || (status === "active") === b.is_active),
    );
  }, [list.data, typed, kind, status]);

  const all = list.data ?? [];
  const n = (v: number) => (list.loading && !list.data ? (list.loading ? "…" : "—") : v.toLocaleString("en-IN"));
  const stats = [
    { label: "Branches", value: n(all.length), note: `${all.filter((b) => !b.is_active).length} inactive` },
    { label: "Students", value: n(all.reduce((t, b) => t + b.students, 0)), note: "Across all branches" },
    { label: "Staff", value: n(all.reduce((t, b) => t + b.staff, 0)), note: "Across all branches" },
    { label: "No head", value: n(all.filter((b) => b.is_active && !b.head_user_id).length), note: "Active branches without a head" },
  ];

  const rows: Row[] = items.map((b) => [
    { name: b.name, sub: b.is_main ? "Main campus" : undefined },
    b.code,
    school.data?.name ?? "—",
    b.head_name ?? "—",
    b.students.toLocaleString("en-IN"),
    b.is_active ? "Active" : "Inactive",
  ]);

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search branches list…" aria-label="Search branches" />
        </div>
        <select aria-label="Filter by kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All branches</option>
          <option value="main">Main campus</option>
          <option value="other">Other branches</option>
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <Panel title="All branches" sub={`${school.data?.name ?? "This school"}${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Branch", "Code", "School", "Coordinator", "Students", "Status"]}
          rows={rows}
          onView={(i) => router.push(`${routeOf(27)}?id=${items[i].id}`)}
          empty={list.loading ? "Loading branches…" : list.data?.length ? "No branches match these filters." : "One campus — no branches added yet."}
        />
      </Panel>
    </>
  );
}

/**
 * SCR-026 Add Branch (POST /branches) and edit (?id=, PUT /branches/{id}).
 * The PUT replaces the record, so every field is sent each time.
 */
export function BranchForm() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const list = useApi<Branch[]>(BRANCHES);
  const staff = useApi<StaffPick[]>("/api/v1/school/directory/staff");
  const school = useApi<SchoolProfile>("/api/v1/school/profile");
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (id && list.loading && !list.data) return <Loading what="Loading the branch…" />;
  const branch = id ? list.data?.find((b) => String(b.id) === id) : undefined;
  if (id && list.data && !branch) return <PickFirst what="branch" href={routeOf(25)} cta="Open the branches list" />;
  const current = years.data?.find((y) => y.is_current);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const head = orNull(f.get("head_user_id"));
    const body = {
      name: String(f.get("name") ?? "").trim(),
      code: String(f.get("code") ?? "").trim().toUpperCase(),
      address: orNull(f.get("address")),
      phone: orNull(f.get("phone")),
      email: orNull(f.get("email")),
      capacity: orNull(f.get("capacity")) === null ? null : Number(f.get("capacity")),
      head_user_id: head ? Number(head) : null,
      is_main: f.get("is_main") === "on",
      is_active: f.get("status") !== "inactive",
    };
    setSaving(true);
    setError(null);
    try {
      const saved = branch ? await api.put<Branch>(`${BRANCHES}/${branch.id}`, body) : await api.post<Branch>(BRANCHES, body);
      notify(branch ? "Branch updated." : "Branch created.");
      router.push(`${routeOf(27)}?id=${saved.id}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="two-col">
      <form id="branch-form" className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? list.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <SectionTitle n="01">Details</SectionTitle>
              <div className="form-grid">
                <Field label="Branch name" required>
                  <input type="text" name="name" required minLength={2} placeholder="Enter branch name" defaultValue={branch?.name ?? ""} />
                </Field>
                <Field label="Branch code" required>
                  <input type="text" name="code" required placeholder="Enter branch code" defaultValue={branch?.code ?? ""} />
                </Field>
                <Field label="School" required>
                  <input aria-label="School" readOnly value={school.data?.name ?? "This school"} />
                </Field>
                <Field label="Coordinator">
                  <select name="head_user_id" aria-label="Coordinator" defaultValue={branch?.head_user_id ?? ""}>
                    <option value="">{staff.loading ? "Loading staff…" : "No coordinator yet"}</option>
                    {staff.data?.map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {`${s.full_name} · ${label(s.role)}`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Phone">
                  <input type="tel" name="phone" placeholder="Enter phone" defaultValue={branch?.phone ?? ""} />
                </Field>
                <Field label="Email address">
                  <input type="email" name="email" placeholder="Enter email address" defaultValue={branch?.email ?? ""} />
                </Field>
                <Field label="Capacity">
                  <input type="number" name="capacity" min={0} placeholder="Students the campus can take" defaultValue={branch?.capacity ?? ""} />
                </Field>
                <Field label="Status">
                  <select name="status" aria-label="Status" defaultValue={branch && !branch.is_active ? "inactive" : "active"}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </Field>
                <Field label="Address" full>
                  <input type="text" name="address" placeholder="Enter address" defaultValue={branch?.address ?? ""} />
                </Field>
                <label className="field full">
                  <span>
                    <input type="checkbox" name="is_main" defaultChecked={branch?.is_main ?? false} /> This is the main campus
                  </span>
                </label>
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
              {saving ? "Saving…" : branch ? "Save branch" : "Create branch"}
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
              ["Branch", branch?.name ?? "New branch"],
              ["Status", branch ? (branch.is_active ? "Active" : "Inactive") : "Active on save"],
            ]}
          />
          <div className="gap" />
          <p>Sections and staff are placed at a branch from its details page after it is saved.</p>
        </div>
      </aside>
    </div>
  );
}

/**
 * SCR-027, live. There is no GET for one branch, so it is read from the
 * list. Sections and staff are each saved as a complete set (PUT replaces
 * them). Sections can be read back; staff cannot, so that picker starts
 * empty and says so. DELETE /branches/{id} removes a branch once no section
 * or staff member is placed there (the API refuses otherwise).
 */
export function BranchDetails() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const list = useApi<Branch[]>(id ? BRANCHES : null);
  const school = useApi<SchoolProfile>("/api/v1/school/profile");
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const current = years.data?.find((y) => y.is_current);
  const classes = useApi<SchoolClass[]>(current ? "/api/v1/school/classes" : null, { academic_year_id: current?.id });
  const staff = useApi<StaffMember[]>("/api/v1/school/staff", { status: "active" });
  const history = useApi<AuditEntry[]>(id ? "/api/v1/school/audit-log" : null, { entity_type: "Branch", entity_id: id, limit: 3 });
  const [editing, setEditing] = useState<"sections" | "staff" | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branch = list.data?.find((b) => String(b.id) === id);
  const allSections = useMemo(() => (classes.data ?? []).flatMap((c) => c.sections.map((s) => ({ id: s.id, name: `${c.name} ${s.name}` }))), [classes.data]);
  useEffect(() => setEditing(null), [id]);

  if (!id) return <PickFirst what="branch" href={routeOf(25)} cta="Open the branches list" />;
  if (list.loading && !list.data) return <Loading what="Loading the branch…" />;
  if (!branch) return <ErrorNote>{list.error ?? "Branch not found."}</ErrorNote>;

  const here = new Set(branch.section_ids ?? []);
  const sectionsHere = allSections.filter((s) => here.has(s.id));

  function open(which: "sections" | "staff") {
    setPicked(which === "sections" ? new Set(here) : new Set());
    setEditing(which);
    setError(null);
  }

  async function save() {
    if (!editing || !branch) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`${BRANCHES}/${branch.id}/${editing}`, { ids: [...picked] });
      notify(`${picked.size} ${editing === "sections" ? "section(s)" : "staff member(s)"} now at ${branch.name}.`);
      setEditing(null);
      await list.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!branch) return;
    if (!(await ask(`Delete the branch ${branch.name}? Role assignments limited to it become school-wide. This cannot be undone.`))) return;
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`${BRANCHES}/${branch.id}`);
      notify(`${branch.name} deleted.`);
      router.push(routeOf(25));
    } catch (err) {
      setError(errorText(err));
      setDeleting(false);
    }
  }

  const toggle = (n: number) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  const choices = editing === "sections" ? allSections : (staff.data ?? []).map((s) => ({ id: s.id, name: `${s.full_name}${s.designation ? ` · ${s.designation}` : ""}` }));

  return (
    <>
      <section className="panel profile-banner">
        <div className="profile-hero">
          <div className="row">
            <span className="avatar mint large">{initials(branch.name)}</span>
            <div>
              <h2>{branch.name}</h2>
              <p>{`${school.data?.name ?? "—"}${branch.address ? ` · ${branch.address}` : ""}`}</p>
              <div className="profile-meta">
                <span>
                  <Icon name="pin" className="sm" />
                  {branch.is_main ? " Main campus" : ` ${branch.code}`}
                </span>
                <span>
                  <Icon name="calendar" className="sm" />
                  {` ${current?.name ?? "—"}`}
                </span>
                <Badge>{branch.is_active ? "Active" : "Inactive"}</Badge>
              </div>
            </div>
          </div>
          <div className="profile-badge">
            <strong>{count(branch.students)}</strong>
            <small>Students</small>
          </div>
        </div>
        <nav className="module-tabs profile-tabs">
          <Link href={routeOf(21)}>Overview</Link>
          <Link href={routeOf(22)}>Schools</Link>
          <Link href={routeOf(25)} className="active">
            Branches
          </Link>
          <Link href={routeOf(32)}>Branding</Link>
        </nav>
      </section>
      <ErrorNote>{error}</ErrorNote>
      <div className="two-col">
        <div className="stack">
          <Panel title="Organization information">
            <KV
              rows={[
                ["Branch name", branch.name],
                ["Branch code", branch.code],
                ["Coordinator", branch.head_name ?? "—"],
                ["Phone", branch.phone ?? "—"],
                ["Email address", branch.email ?? "—"],
                ["Students", branch.capacity ? `${count(branch.students)} of ${count(branch.capacity)}` : count(branch.students)],
                ["Address", branch.address ?? "—"],
              ]}
            />
          </Panel>
          <Panel
            title={editing === "staff" ? "Choose the staff at this branch" : "Sections at this branch"}
            sub={editing ? `${picked.size} chosen` : `${sectionsHere.length} of ${allSections.length} sections in ${current?.name ?? "this year"}`}
            action={
              editing ? (
                <div className="row">
                  <button type="button" className="btn" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                  <button type="button" className="btn primary" disabled={saving} onClick={save}>
                    <Icon name="check" className="sm" />
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              ) : (
                <div className="row">
                  <button type="button" className="btn" onClick={() => open("sections")}>
                    Choose sections
                  </button>
                  <button type="button" className="btn" onClick={() => open("staff")}>
                    Choose staff
                  </button>
                </div>
              )
            }
          >
            {editing ? (
              <>
                {editing === "staff" ? (
                  <p className="muted" style={{ marginBottom: 10 }}>
                    {`The current staff list cannot be read back, so this starts empty. Saving replaces everyone at ${branch.name} (${branch.staff} now) with the people ticked here.`}
                  </p>
                ) : null}
                {choices.length ? (
                  choices.map((c) => (
                    <label key={c.id} className="row" style={{ padding: "4px 0" }}>
                      <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                      {c.name}
                    </label>
                  ))
                ) : (
                  <p className="muted">Nothing to choose from yet.</p>
                )}
              </>
            ) : sectionsHere.length ? (
              <p>{sectionsHere.map((s) => s.name).join(", ")}</p>
            ) : (
              <p className="muted">No sections are placed at this branch yet.</p>
            )}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="At a glance">
            <div className="progress-stack">
              <div className="progress-label">
                <span>Sections</span>
                <strong>{count(branch.sections)}</strong>
              </div>
              <div className="progress-label">
                <span>Staff</span>
                <strong>{count(branch.staff)}</strong>
              </div>
              <div className="progress-label">
                <span>Students</span>
                <strong>{count(branch.students)}</strong>
              </div>
              <div className="progress-label">
                <span>Main campus</span>
                <strong>{branch.is_main ? "Yes" : "No"}</strong>
              </div>
            </div>
          </Panel>
          <Panel title="Recent activity">
            {history.data?.length ? (
              history.data.map((h) => (
                <div className="timeline-item" key={h.id}>
                  <span className="timeline-dot">
                    <Icon name={h.action === "create" ? "plus" : h.action === "delete" ? "bell" : "file"} />
                  </span>
                  <div>
                    <h4>{`Branch ${h.action === "create" ? "created" : h.action === "delete" ? "deleted" : "updated"}`}</h4>
                    <p>{`${dateTime(h.created_at)} · ${h.user_name ?? "System"}`}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">{history.loading ? "Loading…" : history.error ? "The audit log is not available to you." : "No changes recorded yet."}</p>
            )}
          </Panel>
          <Panel title="Delete branch">
            <p className="muted" style={{ marginBottom: 12 }}>
              {branch.sections || branch.staff
                ? `Move its ${count(branch.sections)} section(s) and ${count(branch.staff)} staff member(s) to another branch first; a branch with people placed at it cannot be deleted.`
                : "Nothing is placed at this branch, so it can be deleted."}
            </p>
            <button type="button" className="btn" disabled={deleting || Boolean(branch.sections || branch.staff)} onClick={remove}>
              {deleting ? "Deleting…" : "Delete branch"}
            </button>
          </Panel>
        </aside>
      </div>
    </>
  );
}
