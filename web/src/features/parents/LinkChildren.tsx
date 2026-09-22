"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText, type Paginated } from "@/lib/api";
import { initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { Guardian, Student } from "@/features/students/types";
import { PICK_PARENT, relationsOf, useParent } from "./ParentShell";
import { RELATIONS, type ChildLink, type ParentRelation } from "./types";

import { ask } from "@/lib/dialog";
const TONES = ["mint", "lilac", "peach", ""];

/**
 * SCR-074, live: GET /parents/{id}; POST /parents/{id}/links {student_id, relation};
 * DELETE /parents/{id}/links/{student_id}; family contacts from each child's
 * GET /students/{id}/guardians.
 */
export function LinkChildren() {
  const { id, data: p, error, loading, reload } = useParent();
  const students = useApi<Paginated<Student>>(id ? "/api/v1/school/students" : null, { status: "active", page_size: 200 });
  const [studentId, setStudentId] = useState("");
  const [relation, setRelation] = useState<ParentRelation>("mother");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [contacts, setContacts] = useState<(Guardian & { child: string })[] | null>(null);

  const childKey = p?.children.map((c) => c.student_id).join(",") ?? "";
  useEffect(() => {
    if (!p) return;
    let live = true;
    Promise.all(
      p.children.map((c) =>
        api
          .get<Guardian[]>(`/api/v1/school/students/${c.student_id}/guardians`)
          .then((gs) => gs.map((g) => ({ ...g, child: c.full_name })))
          .catch(() => []),
      ),
    ).then((all) => {
      if (!live) return;
      const seen = new Set<number>();
      setContacts(all.flat().filter((g) => (seen.has(g.guardian_id) ? false : (seen.add(g.guardian_id), true))));
    });
    return () => {
      live = false;
    };
    // childKey captures the children
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childKey]);

  const linked = useMemo(() => new Set(p?.children.map((c) => c.student_id)), [p]);
  const available = (students.data?.items ?? []).filter((s) => !linked.has(s.id));

  if (!id) return <PickFirst {...PICK_PARENT} />;
  if (loading && !p) return <Loading what="Loading the parent…" />;
  if (!p) return <ErrorNote>{error ?? "Parent not found."}</ErrorNote>;

  async function link(e: FormEvent) {
    e.preventDefault();
    if (!studentId) return;
    setBusy(true);
    setFailed(null);
    try {
      await api.post(`/api/v1/school/parents/${id}/links`, { student_id: Number(studentId), relation });
      notify("Child linked.");
      setStudentId("");
      reload();
    } catch (err) {
      setFailed(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function unlink(c: ChildLink) {
    if (!(await ask(`Unlink ${c.full_name} from ${p!.full_name}?`))) return;
    setFailed(null);
    try {
      await api.delete(`/api/v1/school/parents/${id}/links/${c.student_id}`);
      notify(`Unlinked ${c.full_name}.`);
      reload();
    } catch (err) {
      setFailed(errorText(err));
    }
  }

  const rows: Row[] = (contacts ?? []).map((g) => [{ name: g.full_name, sub: g.child }, label(g.relation), g.phone ?? "—", g.is_primary ? "Yes" : "No"]);

  return (
    <>
      <ErrorNote>{failed}</ErrorNote>
      <div className="two-col">
        <div className="stack">
          <Panel title="Linked children" sub={`${p.full_name} · Parent account`} flush>
            {p.children.length ? (
              p.children.map((c, i) => (
                <div className="request-card" key={c.student_id}>
                  <span className={`avatar ${TONES[i % 4]} large`}>{initials(c.full_name)}</span>
                  <div className="request-info">
                    <h3>{c.full_name}</h3>
                    <p>{`${c.section_label ?? "—"} · Admission no. ${c.admission_no}`}</p>
                    <p>{`Linked as ${c.relation}`}</p>
                  </div>
                  <Badge>Linked</Badge>
                  <Link href={`${routeOf(57)}?id=${c.student_id}`} className="btn">
                    View profile
                  </Link>
                  <button type="button" className="btn" onClick={() => unlink(c)}>
                    Unlink
                  </button>
                </div>
              ))
            ) : (
              <div className="panel-pad muted">No children linked yet.</div>
            )}
          </Panel>
          <section className="panel" id="link-child">
            <div className="panel-head">
              <div>
                <h2>Link child</h2>
                <p>A parent sees every child linked here, and nothing else.</p>
              </div>
            </div>
            <form className="panel-body" onSubmit={link}>
              <div className="form-grid">
                <label className="field">
                  <span>
                    Student
                    <span className="req">*</span>
                  </span>
                  <select value={studentId} onChange={(e) => setStudentId(e.target.value)} required aria-label="Student">
                    <option value="">{students.loading ? "Loading students…" : available.length ? "Select student" : "Every student is already linked"}</option>
                    {available.map((s) => (
                      <option key={s.id} value={s.id}>
                        {`${s.full_name} (${s.admission_no})`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>
                    Relationship
                    <span className="req">*</span>
                  </span>
                  <select value={relation} onChange={(e) => setRelation(e.target.value as ParentRelation)} aria-label="Relationship">
                    {RELATIONS.map((r) => (
                      <option key={r} value={r}>
                        {label(r)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="gap" />
              <button type="submit" className="btn primary" disabled={busy || !studentId}>
                <Icon name="plus" className="sm" />
                {busy ? "Linking…" : "Link child"}
              </button>
            </form>
          </section>
          <Panel title="Family contacts" sub="Guardians recorded on the linked children" flush>
            <DataTable
              columns={["Guardian", "Relationship", "Phone", "Primary contact"]}
              rows={rows}
              selectable={false}
              rowAction={false}
              empty={contacts === null ? "Loading…" : "No guardian contacts are recorded on these children."}
            />
          </Panel>
        </div>
        <aside>
          <Panel title="Guardian information">
            <dl className="kv">
              <div>
                <dt>Guardian name</dt>
                <dd>{p.full_name}</dd>
              </div>
              <div>
                <dt>Relationship</dt>
                <dd>{relationsOf(p)}</dd>
              </div>
              <div>
                <dt>Mobile number</dt>
                <dd>{p.phone ?? "—"}</dd>
              </div>
              <div>
                <dt>Email address</dt>
                <dd>{p.email ?? "—"}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{p.address ?? "—"}</dd>
              </div>
            </dl>
          </Panel>
        </aside>
      </div>
    </>
  );
}
