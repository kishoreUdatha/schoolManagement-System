"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { AuditEntry, Parent, ParentNote } from "./types";

import { ask } from "@/lib/dialog";
/** Load the parent named by ?id= (their user id). */
export function useParent() {
  const id = useSearchParams().get("id");
  const res = useApi<Parent>(id ? `/api/v1/school/parents/${id}` : null);
  return { id, ...res };
}

/** "Aarav", "Aarav and Diya", "Aarav, Diya and Kabir". */
export function childNames(p: Parent): string {
  const first = p.children.map((c) => c.full_name.split(/\s+/)[0]);
  if (!first.length) return "";
  return first.length === 1 ? first[0] : `${first.slice(0, -1).join(", ")} and ${first.at(-1)}`;
}

/** The distinct relations a parent holds to their children, e.g. "Father". */
export function relationsOf(p: Parent): string {
  const r = [...new Set(p.children.map((c) => label(c.relation)))];
  return r.length ? r.join(" / ") : "—";
}

/** Tabs across the parent record screens, each carrying ?id= on. */
export const PARENT_TABS = [
  ["overview", "Overview"],
  ["children", "Children"],
  ["access", "Login access"],
  ["interactions", "Interactions"],
  ["payments", "Payments"],
  ["activity", "Activity"],
] as const;
export type ParentTab = (typeof PARENT_TABS)[number][0];

/** The tab named by ?tab= on the parent profile (Overview when absent). */
export function useParentTab(): ParentTab {
  const t = useSearchParams().get("tab");
  return PARENT_TABS.some(([k]) => k === t) ? (t as ParentTab) : "overview";
}

/**
 * Tabs across the parent profile. They stay on the profile page and only
 * change ?tab= (replacing the address, so Back leaves the profile rather than
 * stepping through tabs); the header stays put and just the content below
 * changes. Each tab still has its own address to share or reload.
 */
export function ParentTabs({ id, tab }: { id: string; tab: ParentTab }) {
  return (
    <nav className="module-tabs profile-tabs">
      {PARENT_TABS.map(([k, t]) => (
        <Link key={k} href={`${routeOf(73)}?id=${id}${k === "overview" ? "" : `&tab=${k}`}`} scroll={false} replace className={k === tab ? "active" : ""} aria-current={k === tab ? "page" : undefined}>
          {t}
        </Link>
      ))}
    </nav>
  );
}

/** Name, children and account status across the top of a parent record. */
export function ParentBanner({ p, tab, badge }: { p: Parent; tab?: ParentTab; badge?: ReactNode }) {
  const kids = childNames(p);
  return (
    <section className="panel profile-banner">
      <div className="profile-hero">
        <div className="row">
          <span className="avatar mint large">{initials(p.full_name)}</span>
          <div>
            <h2>{p.full_name}</h2>
            <p>{kids ? `Parent of ${kids}` : "No children linked yet"}</p>
            <div className="profile-meta">
              {p.email ? (
                <span>
                  <Icon name="message" className="sm" />
                  {` ${p.email}`}
                </span>
              ) : null}
              <span>
                <Icon name="calendar" className="sm" />
                {` Last sign-in ${p.last_login_at ? dateTime(p.last_login_at) : "never"}`}
              </span>
              <Badge>{p.is_active ? "Active" : "Inactive"}</Badge>
            </div>
          </div>
        </div>
        {badge ?? (
          <div className="profile-badge">
            <strong>{p.children.length}</strong>
            <small>{p.children.length === 1 ? "Child linked" : "Children linked"}</small>
          </div>
        )}
      </div>
      {tab ? <ParentTabs id={String(p.user_id)} tab={tab} /> : null}
    </section>
  );
}

/** A page-head button that keeps the current ?id= (e.g. "Edit guardian"). */
export function WithParentLink({ screen, icon, children, primary = true }: { screen: number; icon: "arrow" | "check" | "plus"; children: string; primary?: boolean }) {
  const id = useSearchParams().get("id");
  return (
    <Link href={id ? `${routeOf(screen)}?id=${id}` : routeOf(71)} className={`btn ${primary ? "primary" : ""}`}>
      <Icon name={icon} className="sm" />
      {children}
    </Link>
  );
}

const FIELD = (k: string) => k.replace(/_/g, " ");

/** Say what an audit row did without dumping JSON at somebody. */
export function describe(e: AuditEntry): { title: string; sub: string; icon: "file" | "check" | "message" | "calendar" | "money" | "shield" } {
  const who = e.user_name ?? "System";
  const thing = e.entity_type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  const before = e.old_values ?? {};
  const after = e.new_values ?? {};
  const keys = Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (e.entity_type === "User" && e.action === "update" && keys.length === 1 && keys[0] === "last_login_at") {
    return { title: "Signed in", sub: "Parent portal", icon: "shield" };
  }
  if (e.entity_type === "User" && keys.includes("is_active")) {
    return { title: after.is_active ? "Portal access enabled" : "Portal access disabled", sub: who, icon: "shield" };
  }
  if (e.entity_type === "User" && keys.includes("password_hash")) {
    return { title: "Password changed", sub: who, icon: "shield" };
  }
  const icon = /fee|payment|refund/i.test(e.entity_type) ? "money" : /preference|notice/i.test(e.entity_type) ? "message" : e.action === "create" ? "check" : "file";
  if (e.action === "create") return { title: `${label(thing)} created`, sub: who, icon };
  if (e.action === "delete") return { title: `${label(thing)} removed`, sub: who, icon };
  const moved = keys.slice(0, 3).map(FIELD).join(", ");
  return { title: `${label(thing)} updated`, sub: moved ? `${who} · ${moved}${keys.length > 3 ? ` and ${keys.length - 3} more` : ""}` : who, icon };
}

/** An audit row as the mock's timeline item. */
export function AuditItem({ e }: { e: AuditEntry }) {
  const d = describe(e);
  return (
    <div className="timeline-item">
      <span className="timeline-dot">
        <Icon name={d.icon} />
      </span>
      <div>
        <h4>{d.title}</h4>
        <p>{d.sub}</p>
      </div>
      <time>{dateTime(e.created_at)}</time>
    </div>
  );
}

/** Parent record screens opened without ?id=. */
export const PICK_PARENT = { what: "parent or guardian", href: routeOf(71), cta: "Open the parent directory" };

/** Office notes on a parent: GET /parents/{id}/notes. */
export function useParentNotes(id: string | null) {
  return useApi<ParentNote[]>(id ? `/api/v1/school/parents/${id}/notes` : null);
}

/** "Add note": a button that opens a short form, POST /parents/{id}/notes. */
export function AddNote({ id, onAdded }: { id: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/parents/${id}/notes`, { body });
      notify("Note added.");
      form.reset();
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Icon name="plus" className="sm" />
        Add note
      </button>
    );
  return (
    <form onSubmit={submit} style={{ width: "100%" }}>
      <ErrorNote>{error}</ErrorNote>
      <label className="field">
        <span>Note</span>
        <textarea name="body" required maxLength={4000} rows={3} placeholder="A call, a visit, something to follow up" autoFocus />
      </label>
      <div className="gap" />
      <div className="actions">
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={busy}>
          <Icon name="check" className="sm" />
          {busy ? "Saving…" : "Save note"}
        </button>
      </div>
    </form>
  );
}

/** The office notes, newest first, each removable. Parents never see these. */
export function NotesPanel({ id, notes, loading, onChange }: { id: string; notes: ParentNote[] | null; loading: boolean; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  async function remove(n: ParentNote) {
    if (!(await ask("Delete this note?"))) return;
    setError(null);
    try {
      await api.delete(`/api/v1/school/parents/${id}/notes/${n.id}`);
      notify("Note deleted.");
      onChange();
    } catch (err) {
      setError(errorText(err));
    }
  }
  return (
    <Panel title="Office notes" sub="Only school staff see these">
      <ErrorNote>{error}</ErrorNote>
      {notes?.length ? (
        notes.map((n) => (
          <div className="timeline-item" key={n.id}>
            <span className="timeline-dot">
              <Icon name="file" />
            </span>
            <div>
              <h4>{n.body}</h4>
              <p>
                {`${n.created_by_name ?? "School office"} · `}
                <button type="button" className="btn text" onClick={() => remove(n)}>
                  Delete
                </button>
              </p>
            </div>
            <time>{dateTime(n.created_at)}</time>
          </div>
        ))
      ) : (
        <p className="muted">{loading ? "Loading…" : "No notes yet."}</p>
      )}
    </Panel>
  );
}
