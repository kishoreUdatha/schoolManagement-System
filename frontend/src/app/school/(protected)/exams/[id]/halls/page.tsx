"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, Select, Table, WarnBox, td, tdStrong } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type Paper = {
  id: number;
  subject_name: string | null;
  class_name: string | null;
  exam_date: string;
  start_time: string | null;
  max_marks: number;
};
type Exam = { id: number; name: string; papers: Paper[] };

type Room = {
  id: number;
  name: string;
  code: string;
  kind: string;
  capacity: number;
  building: string | null;
  floor: string | null;
};
type SeatedStudent = {
  student_id: number;
  admission_no: string;
  student_name: string;
  roll_no: number | null;
  section_name: string | null;
};
type RoomSeating = {
  room_id: number;
  room_name: string;
  capacity: number;
  seated: number;
  over_capacity: boolean;
  students: SeatedStudent[];
};
type Allocation = {
  paper_id: number;
  subject_name: string;
  class_name: string | null;
  exam_date: string;
  candidates: number;
  seated: number;
  rooms: RoomSeating[];
  unplaced: SeatedStudent[];
};

export default function ExamHallsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const paperParam = search.get("paper");

  const [papers, setPapers] = useState<Paper[]>([]);
  const [paperId, setPaperId] = useState<number | "">("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [alloc, setAlloc] = useState<Allocation | null>(null);
  // An array, not a set: the backend fills rooms in the order it is given, so
  // the order the office ticks them in is the order children are seated.
  const [chosen, setChosen] = useState<number[]>([]);
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
    api
      .get<Room[]>("/api/v1/school/exam-ops/rooms")
      .then((r) => setRooms(r.data))
      .catch((e) => setError(apiError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const load = useCallback(
    (pid: number) =>
      api
        .get<Allocation>(`/api/v1/school/exam-ops/papers/${pid}/allocation`)
        .then((r) => setAlloc(r.data))
        .catch((e) => setError(apiError(e))),
    []
  );

  useEffect(() => {
    if (!paperId) return;
    setAlloc(null);
    setChosen([]);
    load(paperId);
  }, [paperId, load]);

  const pickPaper = (pid: number) => {
    setPaperId(pid);
    router.replace(`/school/exams/${id}/halls?paper=${pid}`, { scroll: false });
  };

  const toggleRoom = (roomId: number) =>
    setChosen((prev) =>
      prev.includes(roomId) ? prev.filter((r) => r !== roomId) : [...prev, roomId]
    );

  const run = async (fn: () => Promise<{ data: Allocation }>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      setAlloc(res.data);
    } catch (e) {
      // The refusal names the shortfall ("7 children sit this paper but the
      // chosen rooms hold 4"), which is the whole use of it.
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const allocate = () =>
    run(() =>
      api.post<Allocation>(`/api/v1/school/exam-ops/papers/${paperId}/allocation`, {
        room_ids: chosen,
      })
    );

  const clear = () => {
    if (!window.confirm("Empty the seating plan for this paper?")) return;
    run(() => api.delete<Allocation>(`/api/v1/school/exam-ops/papers/${paperId}/allocation`));
  };

  const move = (studentId: number, roomId: number) =>
    run(() =>
      api.post<Allocation>(`/api/v1/school/exam-ops/papers/${paperId}/allocation/move`, {
        student_id: studentId,
        room_id: roomId,
      })
    );

  // A room with no capacity recorded holds whatever it is given, so a chosen
  // set containing one cannot be totted up honestly.
  const chosenSeats = useMemo(() => {
    const picked = chosen.map((c) => rooms.find((r) => r.id === c)).filter(Boolean) as Room[];
    if (picked.some((r) => !r.capacity)) return null;
    return picked.reduce((n, r) => n + r.capacity, 0);
  }, [chosen, rooms]);

  const unplaced = alloc?.unplaced ?? [];

  return (
    <div className="space-y-6">
      <ErrorBox>{error}</ErrorBox>

      <div className="max-w-md">
        <Select
          label="Paper"
          value={paperId}
          onChange={(e) => pickPaper(Number(e.target.value))}
          disabled={papers.length === 0}
        >
          {papers.length === 0 && <option value="">No papers have been added yet</option>}
          {papers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.subject_name ?? "Untitled"} — {p.class_name ?? "No class"} · {p.exam_date}
              {p.start_time ? ` ${p.start_time.slice(0, 5)}` : ""}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sitting this paper" value={alloc?.candidates ?? "—"} />
        <StatCard label="Seated" value={alloc?.seated ?? "—"} />
        <StatCard
          label="Nowhere to sit"
          value={alloc ? unplaced.length : "—"}
          accent={unplaced.length ? "amber" : "emerald"}
        />
        <StatCard label="Rooms in use" value={alloc?.rooms.length ?? "—"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Choose rooms</CardTitle>
          <span className="text-[12px] font-bold text-ink-muted">
            {chosen.length === 0
              ? "Ticked in order; the first fills first"
              : chosenSeats === null
              ? `${chosen.length} room(s), one with no capacity recorded`
              : `${chosen.length} room(s), ${chosenSeats} seat(s) for ${alloc?.candidates ?? "—"} children`}
          </span>
        </CardHeader>
        <CardBody className="space-y-4">
          {rooms.length === 0 ? (
            <p className="text-[13px] text-ink-subtle">
              No rooms have been set up yet. Add them under facilities first.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {rooms.map((r) => {
                const at = chosen.indexOf(r.id);
                return (
                  <label
                    key={r.id}
                    className="flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-[13px]"
                  >
                    <input
                      type="checkbox"
                      checked={at >= 0}
                      onChange={() => toggleRoom(r.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-bold text-ink">{r.name}</span>
                      <span className="block text-[11px] text-ink-subtle">
                        {r.capacity ? `${r.capacity} seats` : "Capacity not set"}
                        {r.building ? ` · ${r.building}` : ""}
                      </span>
                    </span>
                    {at >= 0 && <Badge tone="brand">{at + 1}</Badge>}
                  </label>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={allocate} loading={busy} disabled={!paperId || chosen.length === 0}>
              Allocate
            </Button>
            <Button variant="danger" onClick={clear} disabled={busy || !alloc?.seated}>
              Clear seating plan
            </Button>
          </div>
        </CardBody>
      </Card>

      {unplaced.length > 0 && (
        <>
          <WarnBox>
            {unplaced.length} {unplaced.length === 1 ? "child has" : "children have"} nowhere to
            sit for this paper. Allocate another room before the day.
          </WarnBox>
          <Card>
            <CardHeader>
              <CardTitle>Not yet seated</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <Table head={["Admission no", "Student", "Section", "Roll"]}>
                {unplaced.map((s) => (
                  <tr key={s.student_id}>
                    <td className={td}>{s.admission_no}</td>
                    <td className={tdStrong}>{s.student_name}</td>
                    <td className={td}>{s.section_name ?? "—"}</td>
                    <td className={td}>{s.roll_no ?? "—"}</td>
                  </tr>
                ))}
              </Table>
            </CardBody>
          </Card>
        </>
      )}

      {alloc && alloc.rooms.length === 0 && unplaced.length === 0 && (
        <Card>
          <CardBody>
            <p className="text-[13px] text-ink-subtle">
              Nobody sits this paper yet — check the class has children on the roll.
            </p>
          </CardBody>
        </Card>
      )}

      {alloc?.rooms.map((room) => (
        <Card key={room.room_id}>
          <CardHeader>
            <CardTitle>{room.room_name}</CardTitle>
            <Badge tone={room.over_capacity ? "rose" : "neutral"}>
              {room.seated}
              {room.capacity ? ` of ${room.capacity}` : ""} seated
            </Badge>
          </CardHeader>
          <CardBody className="p-0">
            <Table
              head={["Admission no", "Student", "Section", "Roll", "Move to"]}
              empty={room.students.length === 0 && "Nobody has been seated here yet."}
            >
              {room.students.map((s) => (
                <tr key={s.student_id}>
                  <td className={td}>{s.admission_no}</td>
                  <td className={tdStrong}>{s.student_name}</td>
                  <td className={td}>{s.section_name ?? "—"}</td>
                  <td className={td}>{s.roll_no ?? "—"}</td>
                  <td className={td}>
                    <Select
                      aria-label={`Move ${s.student_name}`}
                      value=""
                      disabled={busy}
                      onChange={(e) => e.target.value && move(s.student_id, Number(e.target.value))}
                    >
                      <option value="">Move to…</option>
                      {rooms
                        .filter((r) => r.id !== room.room_id)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </Table>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
