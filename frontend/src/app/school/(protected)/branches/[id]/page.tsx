"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, GraduationCap, Grid2x2, UserCog, Users } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  WarnBox,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type Branch = {
  id: number;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  head_user_id: number | null;
  head_name: string | null;
  is_main: boolean;
  is_active: boolean;
  sections: number;
  staff: number;
  students: number;
  section_ids: number[];
};
type Year = { id: number; name: string; is_current: boolean };
type Section = { id: number; class_id: number; name: string; capacity: number | null };
type SchoolClass = { id: number; name: string; sections: Section[] };
type Staff = {
  id: number;
  full_name: string;
  employee_no: string | null;
  designation: string | null;
  role: string;
  is_active: boolean;
};

/** One campus: which classes sit there, and who works there.
 *
 *  Both lists are saved as a complete set — the API replaces whatever was
 *  there. Sections can be read back, so that picker starts from the truth.
 *  Staff cannot, so the staff picker says so rather than opening empty and
 *  quietly emptying the branch when somebody presses save.
 */
export default function BranchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [pickSections, setPickSections] = useState<Set<number> | null>(null);
  const [pickStaff, setPickStaff] = useState<Set<number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // There is no GET for one branch — the list is the only way to read it.
  const load = () =>
    api
      .get<Branch[]>("/api/v1/school/branches")
      .then((r) => setBranch(r.data.find((b) => b.id === Number(id)) ?? null))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    api
      .get<Staff[]>("/api/v1/school/staff", { params: { status: "active" } })
      .then((r) => setStaff(r.data))
      .catch(() => undefined);
    api
      .get<Year[]>("/api/v1/school/academic-years")
      .then((r) => {
        const year = r.data.find((y) => y.is_current) ?? r.data[0];
        if (!year) return;
        return api
          .get<SchoolClass[]>("/api/v1/school/classes", {
            params: { academic_year_id: year.id },
          })
          .then((c) => setClasses(c.data));
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const allSections = classes.flatMap((c) =>
    c.sections.map((s) => ({ ...s, class_name: c.name }))
  );
  const here = new Set(branch?.section_ids ?? []);

  const saveSections = async () => {
    if (!pickSections) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api.put(`/api/v1/school/branches/${id}/sections`, {
        ids: [...pickSections],
      });
      setDone(`${pickSections.size} section(s) are now at this branch.`);
      setPickSections(null);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const saveStaff = async () => {
    if (!pickStaff) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api.put(`/api/v1/school/branches/${id}/staff`, { ids: [...pickStaff] });
      setDone(`${pickStaff.size} staff member(s) are now at this branch.`);
      setPickStaff(null);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (set: Set<number>, value: number) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <div className="space-y-6">
      <Link
        href="/school/roles"
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        Roles and branches
      </Link>

      <PageHeader
        title={branch ? branch.name : "Branch"}
        subtitle={branch ? `${branch.code}${branch.address ? ` · ${branch.address}` : ""}` : ""}
        actions={
          branch && (
            <div className="flex gap-2">
              {branch.is_main && <Badge tone="brand">Main campus</Badge>}
              {branch.is_active ? (
                <Badge tone="emerald">Open</Badge>
              ) : (
                <Badge tone="neutral">Closed</Badge>
              )}
            </div>
          )
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {done && <NoticeBox>{done}</NoticeBox>}

      {!branch && !error && <p className="text-[13px] text-ink-subtle">Loading…</p>}

      {branch && (
        <>
          <StatStrip
            stats={[
              { label: "Sections here", value: branch.sections, icon: Grid2x2 },
              { label: "Staff here", value: branch.staff, icon: Users },
              { label: "Children here", value: branch.students, icon: GraduationCap },
              {
                label: "Head of campus",
                value: (
                  <span className="text-[19px] leading-[1.4]">
                    {branch.head_name ?? "Nobody"}
                  </span>
                ),
                note: branch.head_name ? "Named as head" : "Nobody named yet",
                icon: UserCog,
              },
            ]}
          />

          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardBody className="grid gap-3 text-[13px] sm:grid-cols-3">
              <div>
                <div className="text-[11px] font-bold text-ink-subtle">Code</div>
                <div className="text-ink">{branch.code}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-ink-subtle">Phone</div>
                <div className="text-ink">{branch.phone || "Not recorded"}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-ink-subtle">Address</div>
                <div className="text-ink">{branch.address || "Not recorded"}</div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Sections at this branch</CardTitle>
                <p className="mt-[5px] text-[11px] text-ink-muted">
                  Saved as a complete set — unticking one leaves it unassigned.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => setPickSections(new Set(branch.section_ids))}
              >
                Choose sections
              </Button>
            </CardHeader>
            <CardBody className="p-0">
              <Table
                head={["Class", "Section", "Capacity"]}
                empty={
                  branch.section_ids.length === 0 &&
                  "No sections have been placed at this branch yet."
                }
              >
                {allSections
                  .filter((s) => here.has(s.id))
                  .map((s) => (
                    <tr key={s.id}>
                      <td className={tdStrong}>{s.class_name}</td>
                      <td className={td}>{s.name}</td>
                      <td className={td}>{s.capacity ?? "Not set"}</td>
                    </tr>
                  ))}
              </Table>
            </CardBody>
            <PanelFooter
              left={`${branch.section_ids.length} section${
                branch.section_ids.length === 1 ? "" : "s"
              } placed here`}
              right="From the current year's classes"
            />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Staff at this branch</CardTitle>
              <Button variant="secondary" onClick={() => setPickStaff(new Set())}>
                Set the staff list
              </Button>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="text-[13px] text-ink-muted">
                {branch.staff} staff member(s) are recorded here.
              </p>
              <WarnBox>
                The API can say how many staff are at this branch but not which ones, and
                saving replaces the whole list. So choosing staff here means picking
                everybody who works at this campus from scratch — anyone left unticked is
                removed from it.
              </WarnBox>
            </CardBody>
          </Card>
        </>
      )}

      <Modal
        open={pickSections !== null}
        onClose={() => setPickSections(null)}
        title="Sections at this branch"
        size="lg"
      >
        <div className="space-y-3">
          <p className="text-[13px] text-ink-muted">
            Ticked sections sit at this campus. Unticking one leaves it unassigned rather
            than moving it somewhere else.
          </p>
          <div className="max-h-[50vh] space-y-3 overflow-y-auto">
            {classes.map((c) => (
              <div key={c.id}>
                <div className="text-[12px] font-bold text-ink">{c.name}</div>
                <div className="mt-1 flex flex-wrap gap-3">
                  {c.sections.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 text-[13px] text-ink-muted"
                    >
                      <input
                        type="checkbox"
                        checked={pickSections?.has(s.id) ?? false}
                        onChange={() =>
                          setPickSections((p) => (p ? toggle(p, s.id) : p))
                        }
                      />
                      {s.name}
                    </label>
                  ))}
                  {c.sections.length === 0 && (
                    <span className="text-[12px] text-ink-subtle">No sections</span>
                  )}
                </div>
              </div>
            ))}
            {classes.length === 0 && (
              <p className="text-[13px] text-ink-subtle">
                No classes have been set up for the current year.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPickSections(null)}>
              Cancel
            </Button>
            <Button onClick={saveSections} loading={busy}>
              Save {pickSections?.size ?? 0} section(s)
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={pickStaff !== null}
        onClose={() => setPickStaff(null)}
        title="Staff at this branch"
        size="lg"
      >
        <div className="space-y-3">
          <WarnBox>
            This list starts empty because the current members cannot be read back. What
            you tick becomes the complete staff list for this branch.
          </WarnBox>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {staff.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 text-[13px] text-ink-muted"
              >
                <input
                  type="checkbox"
                  checked={pickStaff?.has(s.id) ?? false}
                  onChange={() => setPickStaff((p) => (p ? toggle(p, s.id) : p))}
                />
                <span className="font-bold text-ink">{s.full_name}</span>
                <span className="text-ink-subtle">
                  {s.employee_no ? `${s.employee_no} · ` : ""}
                  {s.designation || humanize(s.role)}
                </span>
              </label>
            ))}
            {staff.length === 0 && (
              <p className="text-[13px] text-ink-subtle">No active staff on file.</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPickStaff(null)}>
              Cancel
            </Button>
            <Button onClick={saveStaff} loading={busy} disabled={(pickStaff?.size ?? 0) === 0}>
              Save {pickStaff?.size ?? 0} staff member(s)
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
