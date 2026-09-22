"use client";

/*
 * PM-053 · Meal menu. The only menu the parent API exposes is today's hostel
 * menu for a hostel resident (menu_today in GET …/hostel). Beside it, the
 * child's own allergies and dietary restrictions from the health record
 * (GET …/health), so a parent can check the two together.
 */

import { useParent } from "@/components/parent/ParentShell";
import { label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmEmpty, PmError, PmLoading, useChildPath } from "../support/pm";
import type { ChildHostel } from "./types";

type Health = { profile: { allergies: string | null; dietary_restrictions: string | null } };

const MEALS = ["breakfast", "lunch", "snacks", "dinner"];

export function MealMenu() {
  return (
    <ChildGate>
      <Menu />
    </ChildGate>
  );
}

function Menu() {
  const { go } = useParent();
  const base = useChildPath();
  const stay = useApi<ChildHostel | null>(base && `${base}/hostel`);
  const health = useApi<Health>(base && `${base}/health`);

  if (stay.loading && stay.data === null && !stay.error) return <PmLoading />;
  const menu = stay.data?.menu_today ?? {};
  const meals = [...MEALS.filter((m) => menu[m]), ...Object.keys(menu).filter((m) => !MEALS.includes(m) && menu[m])];
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const p = health.data?.profile;

  return (
    <>
      <PmError>{stay.error}</PmError>
      {/* Not wired: choosing another day and a day-school (canteen) menu — the parent API returns only today's hostel menu. */}
      {stay.data ? (
        <>
          <div className="item">
            <span>
              <strong>Today</strong>
              <small>
                {today} · {stay.data.hostel_name}
              </small>
            </span>
            <span className="value" />
          </div>
          {meals.length === 0 ? <PmEmpty title="No menu for today">The hostel has not published today’s menu.</PmEmpty> : null}
          {meals.map((m) => (
            <section key={m} className="section">
              <h3>{label(m)}</h3>
              <div className="item">
                <span>
                  <strong>{menu[m]}</strong>
                </span>
                <span className="value" />
              </div>
            </section>
          ))}
        </>
      ) : !stay.error ? (
        <PmEmpty title="No meal menu available">
          Meal menus appear here for hostel residents. For school meals, ask the school office.
        </PmEmpty>
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
