"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { ClipboardList, DoorOpen, ShieldAlert, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, Select, Table, WarnBox, humanize, td, tdStrong } from "@/components/ui/Field";
import { FilterBar, PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

/** A select sized for the filter bar: same height as the search box, and no
 *  stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type Paper = {
  id: number;
  subject_name: string | null;
  class_name: string | null;
  exam_date: string;
  start_time: string | null;
  max_marks: number;
};
type Exam = { id: number; name: string; papers: Paper[] };

type DutyStaff = {
  invigilation_id: number;
  user_id: number;
  name: string;
  role: string;
  is_chief: boolean;
};
type RoomDuty = {
  room_id: number;
  room_name: string;
  seated: number;
  staff: DutyStaff[];
};
type Invigilators = {
  paper_id: number;
  subject_name: string;
  class_name: string | null;
  exam_date: string;
  rooms: RoomDuty[];
  unwatched: RoomDuty[];
};
type AvailableStaff = {
  user_id: number;
  name: string;
  role: string;
  assigned_here: boolean;
  clash: string | null;
  available: boolean;
};
type Duty = {
  paper_id: number;
  subject_name: string;
  class_name: string | null;
  exam_date: string;
  start_time: string | null;
  room_name: string;
  is_chief: boolean;
};
type RosterPerson = {
  user_id: number;
  name: string;
  role: string;
  count: number;
  duties: Duty[];
};
type DutyRoster = { exam_id: number; staff: RosterPerson[]; total_duties: number };

export default function ExamInvigilationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const paperParam = search.get("paper");

  const [papers, setPapers] = useState<Paper[]>([]);
  const [paperId, setPaperId] = useState<number | "">("");
  const [duty, setDuty] = useState<Invigilators | null>(null);
  const [staff, setStaff] = useState<AvailableStaff[]>([]);
  const [roster, setRoster] = useState<DutyRoster | null>(null);
  const [chief, setChief] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Exam>(`/api/v1/school/exams/${id}`)
      .then((r) => {
        setPapers(r.data.papers);
        const wanted = Number(paperParam);
        const found = r.data.papers.find((p) => p.id === wanted);
        setPaperId(found ? found.id : r.data.papers[0]?.id ?? "");
      })
      .catch((e) => setError(apiError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadRoster = useCallback(
    () =>
      api
        .get<DutyRoster>(`/api/v1/school/exam-ops/${id}/duty-roster`)
        .then((r) => setRoster(r.data))
        .catch((e) => setError(apiError(e))),
    [id]
  );

  const load = useCallback(
    (pid: number) => {
      api
        .get<Invigilators>(`/api/v1/school/exam-ops/papers/${pid}/invigilators`)
        .then((r) => setDuty(r.data))
        .catch((e) => setError(apiError(e)));
      api
        .get<AvailableStaff[]>(`/api/v1/school/exam-ops/papers/${pid}/invigilators/available`)
        .then((r) => setStaff(r.data))
        .catch((e) => setError(apiError(e)));
    },
    []
  );

  useEffect(() => {
    if (!paperId) return;
    setDuty(null);
    load(paperId);
    loadRoster();
  }, [paperId, load, loadRoster]);

  const pickPaper = (pid: number) => {
    setPaperId(pid);
    router.replace(`/school/exams/${id}/invigilation?paper=${pid}`, { scroll: false });
  };

  const run = async (fn: () => Promise<{ data: Invigilators }>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      setDuty(res.data);
      if (paperId) load(paperId);
      loadRoster();
    } catch (e) {
      // The refusal names who is already watching what, and when.
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const assign = (roomId: number, userId: number) =>
    run(() =>
      api.post<Invigilators>(`/api/v1/school/exam-ops/papers/${paperId}/invigilators`, {
        room_id: roomId,
        user_id: userId,
        is_chief: !!chief[roomId],
      })
    );

  const unassign = (invigilationId: number) =>
    run(() =>
      api.delete<Invigilators>(
        `/api/v1/school/exam-ops/papers/${paperId}/invigilators/${invigilationId}`
      )
    );

  const unwatched = duty?.unwatched ?? [];
  const onDuty = (duty?.rooms ?? []).reduce((n, r) => n + r.staff.length, 0);

  return (
    <div className="space-y-[18px]">
      <ErrorBox>{error}</ErrorBox>

      {/* The paper is what you are allocating against, so it narrows the
          surface before the figures that describe it. */}
      <FilterBar>
        <select
          aria-label="Paper"
          value={paperId}
          onChange={(e) => pickPaper(Number(e.target.value))}
          disabled={papers.length === 0}
          className={`${filterSelect} min-w-[280px]`}
        >
          {papers.length === 0 && <option value="">No papers have been added yet</option>}
          {papers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.subject_name ?? "Untitled"} — {p.class_name ?? "No class"} · {p.exam_date}
              {p.start_time ? ` ${p.start_time.slice(0, 5)}` : ""}
            </option>
          ))}
        </select>
      </FilterBar>

      {/* Every figure is one the page already worked out: the rooms the
          allocation returned, the staff counted across them, the rooms it
          flagged as unwatched, and the roster's own total. */}
      <StatStrip
        stats={[
          {
            label: "Rooms in use",
            value: duty?.rooms.length ?? "—",
            note: duty ? "seated for this paper" : undefined,
            icon: DoorOpen,
          },
          {
            label: "On duty",
            value: duty ? onDuty : "—",
            note: duty ? `across ${duty.rooms.length} room(s)` : undefined,
            icon: UserCheck,
          },
          {
            label: "Rooms unwatched",
            value: duty ? unwatched.length : "—",
            note: duty
              ? unwatched.length
                ? "nobody is watching these"
                : "every room has somebody"
              : undefined,
            icon: ShieldAlert,
          },
          {
            label: "Duties this exam",
            value: roster?.total_duties ?? "—",
            note: roster ? `${roster.staff.length} member(s) of staff` : undefined,
            icon: ClipboardList,
          },
        ]}
      />

      {unwatched.length > 0 && (
        <WarnBox>
          Nobody is watching {unwatched.map((r) => r.room_name).join(", ")}. A room of children
          with no adult in it is the one thing this page exists to catch.
        </WarnBox>
      )}

      {duty && duty.rooms.length === 0 && (
        <Card>
          <CardBody>
            <p className="text-[13px] text-ink-subtle">
              No rooms have been allocated for this paper yet, so there is nothing to watch.
              Seat the children on the Halls tab first.
            </p>
          </CardBody>
        </Card>
      )}

      {duty?.rooms.map((room) => (
        <Card key={room.room_id}>
          <CardHeader>
            <div>
              <CardTitle>{room.room_name}</CardTitle>
              <p className="mt-[5px] text-[11px] text-ink-muted">
                {room.seated} seated · {room.staff.length} on duty
              </p>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            {room.staff.length === 0 ? (
              <p className="text-[13px] text-ink-subtle">Nobody is on duty here yet.</p>
            ) : (
              <ul className="space-y-2">
                {room.staff.map((s) => (
                  <li
                    key={s.invigilation_id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-surface-border px-3 py-2"
                  >
                    <span className="font-bold text-ink">{s.name}</span>
                    <span className="text-[12px] text-ink-muted">{humanize(s.role)}</span>
                    {s.is_chief && <Badge tone="brand">Chief</Badge>}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      disabled={busy}
                      onClick={() => unassign(s.invigilation_id)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1">
                <Select
                  label="Put somebody on duty"
                  value=""
                  disabled={busy}
                  onChange={(e) => e.target.value && assign(room.room_id, Number(e.target.value))}
                >
                  <option value="">Choose a member of staff…</option>
                  {staff.map((s) => (
                    // Somebody already busy stays on the list, greyed, with the
                    // reason. Dropping them just makes the office hunt for a
                    // name that has quietly gone missing.
                    <option
                      key={s.user_id}
                      value={s.user_id}
                      disabled={!s.available || s.assigned_here}
                    >
                      {s.name} — {humanize(s.role)}
                      {s.assigned_here
                        ? " · already here"
                        : s.clash
                        ? ` · busy with ${s.clash}`
                        : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <label className="flex items-center gap-2 pb-2 text-[13px] text-ink-muted">
                <input
                  type="checkbox"
                  checked={!!chief[room.room_id]}
                  onChange={(e) =>
                    setChief((prev) => ({ ...prev, [room.room_id]: e.target.checked }))
                  }
                />
                As chief
              </label>
            </div>
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Duty roster</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">The whole exam, per person</p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Staff", "Duties", "When", "Paper", "Room"]}
            empty={
              (roster?.staff.length ?? 0) === 0 &&
              "Nobody has been put on duty for this exam yet."
            }
          >
            {(roster?.staff ?? []).flatMap((person) =>
              person.duties.map((d, i) => (
                <tr key={`${person.user_id}-${d.paper_id}-${d.room_name}`}>
                  <td className={tdStrong}>
                    {i === 0 ? person.name : ""}
                    {i === 0 && (
                      <span className="block text-[11px] font-normal text-ink-subtle">
                        {humanize(person.role)}
                      </span>
                    )}
                  </td>
                  <td className={td}>{i === 0 ? person.count : ""}</td>
                  <td className={td}>
                    {d.exam_date}
                    {d.start_time ? ` ${d.start_time.slice(0, 5)}` : ""}
                  </td>
                  <td className={td}>
                    {d.subject_name}
                    <span className="block text-[11px] text-ink-subtle">{d.class_name ?? "—"}</span>
                  </td>
                  <td className={td}>
                    {d.room_name}
                    {d.is_chief && (
                      <Badge tone="brand" className="ml-2">
                        Chief
                      </Badge>
                    )}
                  </td>
                </tr>
              ))
            )}
          </Table>
        </CardBody>
        {roster && (
          <PanelFooter
            left={`${roster.staff.length} member(s) of staff · ${roster.total_duties} duties`}
            right="Every duty in this exam"
          />
        )}
      </Card>
    </div>
  );
}
