"use client";

/*
 * The day-school canteen's weekly menu, beside the hostel mess menu on
 * SCR-214 (GET + PUT /api/v1/school/parent-services/canteen-menu). Parents of
 * day scholars see it in the parent app's Meal menu (PM-053); hostel
 * residents see their hostel's mess menu instead.
 */

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";

const PATH = "/api/v1/school/parent-services/canteen-menu";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MEALS: [string, string][] = [
  ["breakfast", "Breakfast"],
  ["lunch", "Lunch"],
  ["snacks", "Snacks"],
];

type Slot = { day_of_week: number; meal: string; items: string };

export function CanteenMenu() {
  const menu = useApi<Slot[]>(PATH);
  const [grid, setGrid] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (menu.data) setGrid(Object.fromEntries(menu.data.map((s) => [`${s.day_of_week}-${s.meal}`, s.items])));
  }, [menu.data]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const slots = Object.entries(grid)
      .filter(([, v]) => v.trim())
      .map(([k, items]) => {
        const [d, meal] = k.split("-");
        return { day_of_week: Number(d), meal, items: items.trim() };
      });
    setSaving(true);
    setError(null);
    try {
      await api.put(PATH, { slots });
      notify("Canteen menu saved. Parents of day scholars see it in the app.");
      menu.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <ErrorNote>{error ?? menu.error}</ErrorNote>
      <Panel title="Day-school canteen menu" sub="For children who are not hostel residents · the same menu repeats each week" flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Day</th>
                {MEALS.map(([, t]) => (
                  <th key={t}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((d, i) => (
                <tr key={d}>
                  <td>{d}</td>
                  {MEALS.map(([m, t]) => (
                    <td key={m}>
                      <input
                        className="marks-input"
                        style={{ width: "100%", textAlign: "left" }}
                        aria-label={`Canteen ${t} on ${d}`}
                        value={grid[`${i}-${m}`] ?? ""}
                        onChange={(e) => setGrid({ ...grid, [`${i}-${m}`]: e.target.value })}
                        placeholder="—"
                        maxLength={500}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>{menu.loading ? "Loading…" : `${menu.data?.length ?? 0} meal slot(s) planned`}</span>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Save canteen menu"}
          </button>
        </div>
      </Panel>
    </form>
  );
}
