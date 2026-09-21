"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { initials, label } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Kv, StudentFrame } from "./StudentFrame";
import type { Family } from "./records";
import type { Guardian, StudentProfile } from "./types";

/**
 * SCR-068, live: GET /student-detail/{id}/family (siblings derived from
 * shared parent logins) and /students/{id}/guardians (family contacts).
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
  const rows: Row[] = people.map((g) => [g.full_name, label(g.relation), g.phone ?? "—", g.is_primary ? "Yes" : "No"]);

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
        <Panel title="Family contacts" flush>
          <DataTable
            columns={["Guardian", "Relationship", "Phone", "Primary contact"]}
            rows={rows}
            selectable={false}
            rowAction={false}
            empty={guardians.loading ? "Loading…" : "No parent or guardian is recorded yet."}
          />
        </Panel>
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
