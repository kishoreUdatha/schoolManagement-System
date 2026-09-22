"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { OneTimeSecrets } from "./OneTimeSecrets";
import { Kv, StudentFrame } from "./StudentFrame";
import type { Family } from "./records";
import { RELATIONS, type Guardian, type PortalGrant, type Relation, type StudentProfile } from "./types";

import { ask } from "@/lib/dialog";
/**
 * SCR-068, live: GET /student-detail/{id}/family (siblings derived from
 * shared parent logins) and /students/{id}/guardians (family contacts).
 * PATCH / DELETE /students/{id}/guardians/{gid} edit or remove a contact;
 * POST …/{gid}/portal-access makes a parent login (password shown once).
 * Linking goes through the parent's Link Children screen (SCR-074).
 */
export function StudentFamily() {
  return <StudentFrame active={68}>{(s) => <Body s={s} />}</StudentFrame>;
}

const TONES = ["mint", "lilac", "peach", ""];

function Body({ s }: { s: StudentProfile }) {
  const family = useApi<Family>(`/api/v1/school/student-detail/${s.id}/family`);
  const guardians = useApi<Guardian[]>(`/api/v1/school/students/${s.id}/guardians`);
  const people = guardians.data ?? [];
  const primary = people.find((g) => g.is_primary) ?? people[0];
  const parentLogin = family.data?.parents[0];
  const children = [
    { student_id: s.id, full_name: s.full_name, admission_no: s.admission_no, class_name: s.class_name, section_name: s.section_name, is_active: s.is_active, shared: [] as string[] },
    ...(family.data?.siblings ?? []).map((x) => ({ ...x, shared: x.shared_parents })),
  ];
  const rows: Row[] = people.map((g) => [g.full_name, label(g.relation), g.phone ?? "—", g.is_primary ? "Yes" : "No", g.has_portal_login ? "Yes" : "No"]);
  const [editing, setEditing] = useState<Guardian | null>(null);
  const [removing, setRemoving] = useState<Guardian | null>(null);
  const [granted, setGranted] = useState<(PortalGrant & { name: string })[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/v1/school/students/${s.id}/guardians`;

  async function remove() {
    if (!removing) return;
    const g = removing;
    setBusy(g.guardian_id);
    setError(null);
    try {
      await api.delete(`${base}/${g.guardian_id}`);
      notify(`${g.full_name} removed from ${s.full_name}'s family contacts.`);
      setRemoving(null);
      guardians.reload();
      family.reload();
    } catch (e) {
      setError(errorText(e));
      setRemoving(null);
    } finally {
      setBusy(null);
    }
  }

  async function grant(g: Guardian) {
    if (!g.email) {
      setError(`Add ${g.full_name}'s email first: it is their parent-portal login.`);
      setEditing(g);
      return;
    }
    if (!(await ask(`Create a parent-portal login for ${g.full_name} (${g.email})? A temporary password is shown once.`))) return;
    setBusy(g.guardian_id);
    setError(null);
    try {
      const r = await api.post<PortalGrant>(`${base}/${g.guardian_id}/portal-access`);
      setGranted((prev) => [{ ...r, name: g.full_name }, ...(prev ?? [])]);
      guardians.reload();
      family.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="two-col">
      <div className="stack">
        <ErrorNote>{family.error ?? guardians.error}</ErrorNote>
        <Panel
          title="Linked children"
          sub={parentLogin ? `${parentLogin.full_name} · Parent account` : "No parent account linked"}
          action={
            parentLogin ? (
              <Link href={`${routeOf(74)}?id=${parentLogin.user_id}`} className="btn">
                <Icon name="plus" className="sm" />
                Link child
              </Link>
            ) : undefined
          }
          flush
        >
          {children.map((c, i) => (
            <div className="request-card" key={c.student_id}>
              <span className={`avatar ${TONES[i % 4]} large`}>{initials(c.full_name)}</span>
              <div className="request-info">
                <h3>{c.full_name}</h3>
                <p>{`${c.class_name ?? "No class"} ${c.section_name ?? ""} · Admission no. ${c.admission_no}`}</p>
                <p>{c.student_id === s.id ? `Primary guardian: ${primary?.full_name ?? "—"}` : `Shares ${c.shared.join(", ") || "a parent"}`}</p>
              </div>
              <Badge>{c.student_id === s.id ? "This student" : c.is_active ? "Linked" : "Inactive"}</Badge>
              <Link href={`${routeOf(57)}?id=${c.student_id}`} className="btn">
                View profile
              </Link>
            </div>
          ))}
          {family.data && children.length === 1 ? (
            <div className="panel-pad">
              <p className="muted">No siblings found. Siblings appear when children share a parent login.</p>
            </div>
          ) : null}
        </Panel>
        {granted?.length ? (
          <OneTimeSecrets
            title="Parent-portal logins"
            heading={["Email", "Temporary password"]}
            rows={granted.map((g) => ({ key: String(g.user_id), name: g.name, sub: `Parent of ${s.full_name}`, signIn: g.email, password: g.temporary_password, tag: "New" }))}
            footnote="Parent portal: sign in with this email and the temporary password, then choose a new one."
            onDone={() => setGranted(null)}
          />
        ) : null}
        <ErrorNote>{error}</ErrorNote>
        <Panel title="Family contacts" flush>
          <DataTable
            columns={["Guardian", "Relationship", "Phone", "Primary contact", "Portal login"]}
            rows={rows}
            selectable={false}
            actions={(i) => {
              const g = people[i];
              return (
                <>
                  <button type="button" className="btn" disabled={busy !== null} onClick={() => setEditing(g)}>
                    Edit
                  </button>
                  {g.has_portal_login ? null : (
                    <button type="button" className="btn" disabled={busy !== null} onClick={() => grant(g)}>
                      {busy === g.guardian_id ? "Working…" : "Portal access"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn"
                    disabled={busy !== null || g.has_portal_login}
                    title={g.has_portal_login ? "Has a parent login: unlink them from the Parents screen instead" : undefined}
                    onClick={() => setRemoving(g)}
                  >
                    Remove
                  </button>
                </>
              );
            }}
            empty={guardians.loading ? "Loading…" : "No parent or guardian is recorded yet."}
          />
        </Panel>
        {editing ? (
          <GuardianEditor
            key={editing.guardian_id}
            g={editing}
            url={`${base}/${editing.guardian_id}`}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              setError(null);
              guardians.reload();
            }}
          />
        ) : null}
        <Dialog
          open={removing !== null}
          title="Remove this contact?"
          onClose={() => setRemoving(null)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setRemoving(null)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={remove} disabled={busy !== null}>
                {busy !== null ? "Removing…" : "Remove contact"}
              </button>
            </>
          }
        >
          <p>
            {removing
              ? `${removing.full_name} (${label(removing.relation)}) will no longer be a contact for ${s.full_name}.${removing.is_primary ? " Another contact becomes the primary one." : ""} Their details stay if they are linked to another child.`
              : ""}
          </p>
        </Dialog>
      </div>
      <aside>
        <Panel title="Guardian information">
          {primary ? (
            <Kv
              rows={[
                ["Guardian name", primary.full_name],
                ["Relationship", label(primary.relation)],
                ["Mobile number", primary.phone ?? "—"],
                ["Email address", primary.email ?? "—"],
                ["Address", primary.address ?? s.address ?? "—"],
              ]}
            />
          ) : (
            <p className="muted">{guardians.loading ? "Loading…" : "No guardian recorded."}</p>
          )}
        </Panel>
      </aside>
    </div>
  );
}

const blank = (v: string) => (v.trim() ? v.trim() : null);

/** PATCH /students/{id}/guardians/{gid} with every field of GuardianUpdate. */
function GuardianEditor({ g, url, onClose, onSaved }: { g: Guardian; url: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    full_name: g.full_name,
    relation: g.relation as Relation,
    phone: g.phone ?? "",
    email: g.email ?? "",
    occupation: g.occupation ?? "",
    address: g.address ?? "",
    is_primary: g.is_primary,
    can_pickup: g.can_pickup,
    is_emergency_contact: g.is_emergency_contact,
    lives_with_student: g.lives_with_student,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    const phone = blank(f.phone);
    if (f.full_name.trim().length < 2) return setError("Enter the guardian's full name.");
    if (phone && (phone.length < 6 || phone.length > 20)) return setError("Phone number should be 6 to 20 characters.");
    setSaving(true);
    setError(null);
    try {
      await api.patch<Guardian[]>(url, {
        full_name: f.full_name.trim(),
        relation: f.relation,
        phone,
        // A guardian with a portal login signs in with this email; the server refuses a change here.
        email: blank(f.email),
        occupation: blank(f.occupation),
        address: blank(f.address),
        ...(f.is_primary && !g.is_primary ? { is_primary: true } : {}),
        can_pickup: f.can_pickup,
        is_emergency_contact: f.is_emergency_contact,
        lives_with_student: f.lives_with_student,
      });
      notify(`${f.full_name.trim()} saved.`);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  const check = (k: "is_primary" | "can_pickup" | "is_emergency_contact" | "lives_with_student", text: string, disabled = false) => (
    <label className="row" style={{ fontSize: 13, gap: 6 }}>
      <input type="checkbox" checked={f[k]} disabled={disabled} onChange={(e) => set(k, e.target.checked)} />
      {text}
    </label>
  );

  return (
    <Dialog
      open
      wide
      title={`Edit ${g.full_name}`}
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <div className="form-grid">
        <label className="field">
          <span>
            Full name<span className="req">*</span>
          </span>
          <input value={f.full_name} maxLength={160} required onChange={(e) => set("full_name", e.target.value)} />
        </label>
        <label className="field">
          <span>Relationship</span>
          <select value={f.relation} onChange={(e) => set("relation", e.target.value as Relation)}>
            {RELATIONS.map((r) => (
              <option key={r} value={r}>
                {label(r)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Mobile number</span>
          <input value={f.phone} maxLength={20} inputMode="tel" onChange={(e) => set("phone", e.target.value)} />
        </label>
        <label className="field">
          <span>Email address</span>
          <input type="email" value={f.email} maxLength={255} readOnly={g.has_portal_login} onChange={(e) => set("email", e.target.value)} />
          {g.has_portal_login ? <span className="field-hint">This is their portal login; change it from the Parents screen.</span> : null}
        </label>
        <label className="field">
          <span>Occupation</span>
          <input value={f.occupation} maxLength={120} onChange={(e) => set("occupation", e.target.value)} />
        </label>
        <label className="field">
          <span>Address</span>
          <input value={f.address} maxLength={1000} onChange={(e) => set("address", e.target.value)} />
        </label>
        <div className="field full">
          <span>Permissions</span>
          <div className="row" style={{ flexWrap: "wrap", gap: 18 }}>
            {check("is_primary", g.is_primary ? "Primary contact (choose another contact to change)" : "Make primary contact", g.is_primary)}
            {check("can_pickup", "May collect the child")}
            {check("is_emergency_contact", "Emergency contact")}
            {check("lives_with_student", "Lives with the child")}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** "Link sibling" in the page head: the first parent login's Link Children screen. */
export function LinkSiblingButton() {
  const id = useSearchParams().get("id");
  const family = useApi<Family>(id ? `/api/v1/school/student-detail/${id}/family` : null);
  const parent = family.data?.parents[0];
  return (
    <Link href={parent ? `${routeOf(74)}?id=${parent.user_id}` : routeOf(74)} className="btn primary">
      <Icon name="check" className="sm" />
      Link sibling
    </Link>
  );
}
