"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText, type Paginated } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { Student } from "@/features/students/types";
import { RELATIONS, type Parent, type ParentCreateResponse } from "./types";

/**
 * SCR-072, live. Without ?id=: POST /api/v1/school/parents, which creates the
 * login, links one child and returns a temporary password to hand over once.
 * With ?id= (from "Edit guardian" on the profile): PATCH /parents/{id}, which
 * takes name, phone, occupation, address and primary contact — email is the
 * login and cannot change. Occupation and address are kept on the guardian
 * record that mirrors the login; primary contact on the child's guardian link.
 */
export function ParentForm() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const editing = Boolean(id);
  const existing = useApi<Parent>(id ? `/api/v1/school/parents/${id}` : null);
  const students = useApi<Paginated<Student>>(editing ? null : "/api/v1/school/students", { status: "active", page_size: 200 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ParentCreateResponse | null>(null);

  if (editing && existing.loading && !existing.data) return <Loading what="Loading the parent…" />;
  const p = existing.data;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    setSaving(true);
    setError(null);
    try {
      const primary = f.get("primary_contact") === "yes" ? true : undefined;
      if (editing) {
        await api.patch(`/api/v1/school/parents/${id}`, {
          full_name: text("full_name"),
          phone: text("phone"),
          occupation: text("occupation"),
          address: text("address"),
          primary_contact: primary,
        });
        notify("Parent updated.");
        router.push(`${routeOf(73)}?id=${id}`);
        return;
      }
      const res = await api.post<ParentCreateResponse>("/api/v1/school/parents", {
        full_name: text("full_name"),
        email: text("email"),
        phone: text("phone"),
        relation: text("relation") ?? "guardian",
        student_id: Number(text("student_id")),
        occupation: text("occupation"),
        address: text("address"),
        primary_contact: primary,
      });
      notify("Parent created.");
      setCreated(res);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <div className="two-col">
        <section className="panel">
          <div className="panel-pad">
            <h2>{`${created.parent.full_name} can now sign in`}</h2>
            <p className="muted small" style={{ margin: "8px 0 15px" }}>
              Share this temporary password once. It is not shown again; use Reset password on Login access if it is lost.
            </p>
            <dl className="kv">
              <div>
                <dt>Email (login)</dt>
                <dd>{created.parent.email ?? "—"}</dd>
              </div>
              <div>
                <dt>Temporary password</dt>
                <dd className="mono">{created.temporary_password}</dd>
              </div>
            </dl>
          </div>
          <div className="form-footer">
            <span>For siblings, link the other children next.</span>
            <div className="actions">
              <Link href={`${routeOf(74)}?id=${created.parent.user_id}`} className="btn">
                Link another child
              </Link>
              <Link href={`${routeOf(73)}?id=${created.parent.user_id}`} className="btn primary">
                <Icon name="arrow" className="sm" />
                Open profile
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="two-col">
      <form id="parent-form" className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? existing.error ?? students.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Details</h3>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>
                    Guardian name
                    <span className="req">*</span>
                  </span>
                  <input type="text" name="full_name" placeholder="Enter guardian name" aria-label="Guardian name" required minLength={2} maxLength={160} defaultValue={p?.full_name} />
                </label>
                {editing ? null : (
                  <label className="field">
                    <span>
                      Relationship
                      <span className="req">*</span>
                    </span>
                    <select name="relation" aria-label="Relationship" required defaultValue="mother">
                      {RELATIONS.map((r) => (
                        <option key={r} value={r}>
                          {label(r)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="field">
                  <span>Mobile number</span>
                  <input type="tel" name="phone" placeholder="Enter mobile number" aria-label="Mobile number" maxLength={20} defaultValue={p?.phone ?? ""} />
                </label>
                <label className="field">
                  <span>
                    Email address
                    <span className="req">*</span>
                  </span>
                  {editing ? (
                    <input type="email" aria-label="Email address" value={p?.email ?? ""} readOnly />
                  ) : (
                    <input type="email" name="email" placeholder="Enter email address" aria-label="Email address" required />
                  )}
                </label>
                <label className="field">
                  <span>Occupation</span>
                  <input type="text" name="occupation" placeholder="Enter occupation" aria-label="Occupation" maxLength={120} defaultValue={p?.occupation ?? ""} />
                </label>
                <label className="field">
                  <span>Address</span>
                  <input type="text" name="address" placeholder="Enter address" aria-label="Address" maxLength={2000} defaultValue={p?.address ?? ""} />
                </label>
                {editing ? null : (
                  <label className="field">
                    <span>
                      Student
                      <span className="req">*</span>
                    </span>
                    <select name="student_id" aria-label="Student" required defaultValue="">
                      <option value="">{students.loading ? "Loading students…" : "Select student"}</option>
                      {students.data?.items.map((s) => (
                        <option key={s.id} value={s.id}>
                          {`${s.full_name} (${s.admission_no})`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="field">
                  <span>Primary contact</span>
                  {editing && p && p.children.length > 0 && p.children.every((c) => c.is_primary_contact) ? (
                    <input type="text" aria-label="Primary contact" value={`${p.full_name}, for every linked child`} readOnly />
                  ) : (
                    <select name="primary_contact" aria-label="Primary contact" defaultValue={editing ? "keep" : "yes"}>
                      <option value="yes">{editing ? `Make ${p?.full_name ?? "this guardian"} the primary contact` : "This guardian"}</option>
                      <option value="keep">{editing ? "Keep the current primary contact" : "Keep the child’s current primary contact"}</option>
                    </select>
                  )}
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
              {saving ? "Saving…" : editing ? "Save changes" : "Create guardian"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>Parents</h3>
          <dl className="kv">
            <div>
              <dt>Login</dt>
              <dd>{editing ? (p?.email ?? "—") : "Email address"}</dd>
            </div>
            <div>
              <dt>Children</dt>
              <dd>{editing ? String(p?.children.length ?? 0) : "One now, siblings after"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{editing ? (p?.is_active ? "Active" : "Inactive") : "Active on creation"}</dd>
            </div>
          </dl>
          <div className="gap" />
          <p>
            {editing
              ? "Email is the login and cannot be changed here. Children are linked on the Children tab."
              : "Creating a guardian makes a parent portal login and shows a temporary password once."}
          </p>
        </div>
      </aside>
    </div>
  );
}
