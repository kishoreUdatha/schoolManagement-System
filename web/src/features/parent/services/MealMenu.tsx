"use client";

/*
 * PM-053 · Meal menu. The week's menu for the child's meals
 * (GET /parent/me/children/{id}/meal-menu): the hostel mess menu for a
 * hostel resident, otherwise the school canteen's menu. Any day of the week
 * can be picked (today first). Beside it, the child's own allergies and
 * dietary restrictions from the health record (GET …/health), so a parent
 * can check the two together.
 */

import { useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmEmpty, PmError, PmLoading, useChildPath } from "../support/pm";

type Health = { profile: { allergies: string | null; dietary_restrictions: string | null } };
type WeekMenu = { source: "hostel" | "canteen" | "none"; name: string | null; week: { day_of_week: number; meal: string; items: string }[] };

const MEALS = ["breakfast", "lunch", "snacks", "dinner"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** 0 = Monday, as the API counts. */
const todayIndex = () => (new Date().getDay() + 6) % 7;

export function MealMenu() {
  return (
    <ChildGate>
      <Menu />
    </ChildGate>
  );
}

function Menu() {
  const { go, childId } = useParent();
  const base = useChildPath();
  const menu = useApi<WeekMenu>(childId ? `/api/v1/parent/me/children/${childId}/meal-menu` : null);
  const health = useApi<Health>(base && `${base}/health`);
  const [day, setDay] = useState(todayIndex);

  if (menu.loading && !menu.data) return <PmLoading />;
  const m = menu.data;
  const slots = (m?.week ?? []).filter((s) => s.day_of_week === day);
  const meals = [...MEALS.filter((x) => slots.some((s) => s.meal === x)), ...slots.map((s) => s.meal).filter((x) => !MEALS.includes(x))];
  const p = health.data?.profile;

  return (
    <>
      <PmError>{menu.error}</PmError>
      {m && m.source !== "none" ? (
        <>
          <label className="field">
            Day
            <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                  {i === todayIndex() ? " (today)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="item">
            <span>
              <strong>{day === todayIndex() ? "Today" : DAYS[day]}</strong>
              <small>
                {DAYS[day]} · {m.name ?? (m.source === "hostel" ? "Hostel mess" : "School canteen")}
              </small>
            </span>
            <span className="value" />
          </div>
          {meals.length === 0 ? <PmEmpty title={`No menu for ${DAYS[day]}`}>The {m.source === "hostel" ? "hostel" : "canteen"} has not published a menu for this day.</PmEmpty> : null}
          {meals.map((meal) => (
            <section key={meal} className="section">
              <h3>{label(meal)}</h3>
              <div className="item">
                <span>
                  <strong>{slots.find((s) => s.meal === meal)?.items}</strong>
                </span>
                <span className="value" />
              </div>
            </section>
          ))}
        </>
      ) : m ? (
        <PmEmpty title="No meal menu available">The school has not published a hostel or canteen menu yet.</PmEmpty>
      ) : null}

      <div className="panel soft">
        <h3>Your child’s dietary information</h3>
        <p>
          {health.error
            ? health.error
            : !p
              ? "Loading…"
              : [p.allergies ? `Allergies: ${p.allergies}.` : "No allergies recorded.", p.dietary_restrictions ? `Diet: ${p.dietary_restrictions}.` : ""]
                  .filter(Boolean)
                  .join(" ")}{" "}
          From the school health record.
        </p>
      </div>
      <button className="action secondary" onClick={() => go(45)}>
        Ask about dietary requirements
      </button>
    </>
  );
}
