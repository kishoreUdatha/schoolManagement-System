"use client";

import { useEffect, useState } from "react";

import { PickedStudent, StudentPicker } from "@/components/StudentPicker";
import { Select } from "@/components/ui/Field";
import { api } from "@/lib/api";

export type BorrowerValue =
  | { borrower_type: "student"; student_id: number; label: string }
  | { borrower_type: "staff"; user_id: number; label: string }
  | null;

type StaffOption = { user_id: number; full_name: string };

/** Pick a student (search) or a staff member (dropdown). */
export function BorrowerPicker({ value, onChange }: { value: BorrowerValue; onChange: (v: BorrowerValue) => void }) {
  const [kind, setKind] = useState<"student" | "staff">(value?.borrower_type ?? "student");
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [staff, setStaff] = useState<StaffOption[]>([]);

  useEffect(() => {
    api
      .get<StaffOption[]>("/api/v1/school/directory/staff")
      .then((r) => setStaff(r.data))
      .catch(() => undefined);
  }, []);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Select
        label="Borrower"
        value={kind}
        onChange={(e) => {
          setKind(e.target.value as "student" | "staff");
          setStudent(null);
          onChange(null);
        }}
      >
        <option value="student">Student</option>
        <option value="staff">Staff</option>
      </Select>
      <div className="sm:col-span-2">
        {kind === "student" ? (
          <StudentPicker
            label="Student"
            value={student}
            onChange={(s) => {
              setStudent(s);
              onChange(s ? { borrower_type: "student", student_id: s.id, label: s.full_name } : null);
            }}
          />
        ) : (
          <Select
            label="Staff member"
            value={value?.borrower_type === "staff" ? String(value.user_id) : ""}
            onChange={(e) => {
              const s = staff.find((x) => String(x.user_id) === e.target.value);
              onChange(s ? { borrower_type: "staff", user_id: s.user_id, label: s.full_name } : null);
            }}
          >
            <option value="">Select</option>
            {staff.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.full_name}
              </option>
            ))}
          </Select>
        )}
      </div>
    </div>
  );
}

export function borrowerPayload(v: NonNullable<BorrowerValue>) {
  return v.borrower_type === "student"
    ? { borrower_type: "student", student_id: v.student_id }
    : { borrower_type: "staff", user_id: v.user_id };
}
