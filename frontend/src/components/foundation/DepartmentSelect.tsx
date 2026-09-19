"use client";

import { useEffect, useState } from "react";

import { Select } from "@/components/ui/Field";
import { api } from "@/lib/api";

/** Department dropdown; value is the id as a string ("" = none). */
export function DepartmentSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [items, setItems] = useState<{ id: number; name: string; is_active: boolean }[]>([]);
  useEffect(() => {
    api
      .get<{ id: number; name: string; is_active: boolean }[]>("/api/v1/school/departments")
      .then((r) => setItems(r.data.filter((d) => d.is_active || String(d.id) === value)))
      .catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Select label="Department" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">None</option>
      {items.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </Select>
  );
}
