"use client";

import { useEffect, useState } from "react";

import { Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { useAcademicYear } from "@/components/AcademicYearProvider";

export type Audience = "everyone" | "staff" | "parents" | "class_parents" | "section_parents";
type ClassRow = { id: number; name: string; sections?: { id: number; name: string }[] };

export const audienceText: Record<Audience, string> = {
  everyone: "Everyone (parents + staff)",
  staff: "Staff only",
  parents: "All parents",
  class_parents: "Parents of one class",
  section_parents: "Parents of one section",
};

/** Classes of the chosen academic year, each with its sections. */
export function useClasses() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const yearId = useAcademicYear()?.yearId ?? null;
  useEffect(() => {
    (async () => {
      try {
        if (!yearId) return;
        const cs = await api.get<ClassRow[]>("/api/v1/school/classes", { params: { academic_year_id: yearId } });
        const withSections = await Promise.all(
          cs.data.map(async (c) => {
            if (c.sections) return c;
            try {
              const s = await api.get<{ id: number; name: string }[]>(`/api/v1/school/classes/${c.id}/sections`);
              return { ...c, sections: s.data };
            } catch {
              return { ...c, sections: [] };
            }
          })
        );
        setClasses(withSections);
      } catch {
        setClasses([]);
      }
    })();
  }, [yearId]);
  return classes;
}

/** Audience picker with the class / section dropdowns it needs. Values are ids as strings. */
export function AudienceFields({
  audience,
  classId,
  sectionId,
  onChange,
  allowStaff = true,
  scopeOnly = false,
}: {
  audience: Audience;
  classId: string;
  sectionId: string;
  onChange: (v: { audience: Audience; classId: string; sectionId: string }) => void;
  allowStaff?: boolean;
  /** For meetings: just "whole school / class / section". */
  scopeOnly?: boolean;
}) {
  const classes = useClasses();
  const cls = classes.find((c) => String(c.id) === classId);
  const options: Audience[] = scopeOnly
    ? ["parents", "class_parents", "section_parents"]
    : (["everyone", "staff", "parents", "class_parents", "section_parents"] as Audience[]).filter(
        (a) => allowStaff || a !== "staff"
      );
  return (
    <>
      <Select
        label={scopeOnly ? "Which parents can book" : "Audience"}
        value={audience}
        onChange={(e) => onChange({ audience: e.target.value as Audience, classId, sectionId: "" })}
      >
        {options.map((a) => (
          <option key={a} value={a}>
            {scopeOnly && a === "parents" ? "Whole school" : audienceText[a]}
          </option>
        ))}
      </Select>
      {(audience === "class_parents" || audience === "section_parents") && (
        <Select label="Class" value={classId} onChange={(e) => onChange({ audience, classId: e.target.value, sectionId: "" })}>
          <option value="">Choose…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}
      {audience === "section_parents" && (
        <Select label="Section" value={sectionId} onChange={(e) => onChange({ audience, classId, sectionId: e.target.value })}>
          <option value="">Choose…</option>
          {(cls?.sections ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {cls?.name} {s.name}
            </option>
          ))}
        </Select>
      )}
    </>
  );
}
