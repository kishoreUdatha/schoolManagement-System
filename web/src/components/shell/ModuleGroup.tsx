"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type IconName } from "@/components/ui/Icon";
import { MENU_FIRST, MENU_LABEL, TAB_GROUPS } from "@/lib/menuGroups";
import { MODULES, SCREENS } from "@/lib/screens";

/**
 * Screens that are not starting points: a form opened from a list's "Add"
 * button, or a page about one record (?id=). They stay reachable from those
 * buttons and links, from search and from the catalogue, but the menu lists
 * only lists, dashboards, calendars and setup pages. While you are on one, the
 * list it belongs to is highlighted instead (PARENT).
 */
export const NOT_IN_MENU = new Set([
  11, 12, 23, 24, 26, 27, // add / details: organisation, school, branch
  45, 46, 49, 50, // add enquiry, enquiry details, new application, application details
  56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, // add / edit student and the per-student tabs
  72, 73, 74, 76, 79, // add parent and the per-parent pages
  81, 82, 83, // add / edit staff, staff profile
  99, 103, 129, 130, 135, 156, 175, 187, 188, 190, 199, 200, 247, 248, // create / edit forms and record details
  // Other roles' own screens: these groups are the school admin's menu, and the
  // backend answers "access required" to an admin on them. Each role reaches
  // its own through its menu.
  34, 35, 36, 37, 38, 39, 40, 41, 42, // the other roles' dashboards
  110, 114, 128, 131, 132, 134, 145, 147, // teacher / parent / student portal screens
  21, 22, 23, // organisation profile, schools list, add school: the platform's, not a school's
  // the old per-item setup screens: the setup wizard and the academics screens do this now
  28, 29, 30, 31, 32,
  // Tabs of a grouped menu entry (lib/menuGroups): only the group's first screen is listed.
  ...TAB_GROUPS.flatMap((g) => g.tabs.slice(1).map(([n]) => n)),
]);

const OPEN_KEY = "bc_nav_open";

/** The menu entry to highlight while on a screen that is not in the menu. */
export const PARENT: Record<number, number> = {
  11: 10, 12: 10, 23: 22, 24: 22, 26: 25, 27: 25,
  45: 44, 46: 44, 49: 48, 50: 48,
  56: 55, 57: 55, 58: 55, 59: 55, 60: 55, 61: 55, 62: 55, 63: 55, 64: 55, 65: 55, 66: 55, 67: 55, 68: 55,
  72: 71, 73: 71, 74: 71, 76: 71, 79: 71,
  81: 80, 82: 80, 83: 80,
  99: 98, 103: 102, 129: 128, 130: 128, 135: 134, 156: 155, 175: 174,
  187: 186, 188: 186, 190: 189, 199: 198, 200: 198, 247: 246, 248: 246,
  ...Object.fromEntries(TAB_GROUPS.flatMap((g) => g.tabs.slice(1).map(([n]) => [n, g.tabs[0][0]]))),
};

/**
 * One module in the menu: a heading that opens to list the module's screens.
 * Open/closed is React state, not the <details> element's own, so a group
 * the user toggled cannot drift out of step with the page. Arriving on a
 * module opens its group; the others keep whatever the user chose.
 */
export function ModuleGroup({
  label,
  mods,
  currentId,
  currentModule,
  tone,
  count,
}: {
  label: string;
  icon: IconName;
  mods: number[];
  currentId: string;
  currentModule: string;
  tone: number;
  count?: number;
}) {
  const screens = SCREENS.filter((x) => mods.includes(MODULES.indexOf(x.module)) && !NOT_IN_MENU.has(x.n)).sort(
    (a, b) => Number(MENU_FIRST.has(b.n)) - Number(MENU_FIRST.has(a.n)),
  );
  const currentN = SCREENS.find((x) => x.id === currentId)?.n;
  const activeN = currentN !== undefined ? (PARENT[currentN] ?? currentN) : undefined;
  const here = mods.includes(MODULES.indexOf(currentModule));
  const [open, setOpenState] = useState(here);

  // Groups the user opened stay open as they move between screens (each screen
  // draws its own sidebar, so this state would otherwise reset on every click).
  useEffect(() => {
    let remembered = false;
    try {
      remembered = (JSON.parse(sessionStorage.getItem(OPEN_KEY) ?? "[]") as string[]).includes(label);
    } catch {
      /* storage unavailable */
    }
    if (here || remembered) setOpenState(true);
  }, [here, currentId, label]);

  const setOpen = (fn: (o: boolean) => boolean) =>
    setOpenState((o) => {
      const next = fn(o);
      try {
        const set = new Set(JSON.parse(sessionStorage.getItem(OPEN_KEY) ?? "[]") as string[]);
        if (next) set.add(label);
        else set.delete(label);
        sessionStorage.setItem(OPEN_KEY, JSON.stringify([...set]));
      } catch {
        /* storage unavailable */
      }
      return next;
    });

  // One screen is not a menu: show it as a plain entry, with no arrow to open.
  if (screens.length === 1) {
    const only = screens[0];
    return (
      <Link href={only.route} className={`nav ${only.n === activeN ? "active" : ""}`} aria-current={only.id === currentId ? "page" : undefined}>
        <span>{MENU_LABEL[only.n] ?? label}</span>
      </Link>
    );
  }

  return (
    <div className={`nav-group tone-${tone % 6} ${open ? "open" : ""}`}>
      <button type="button" className={`nav ${here ? "active" : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{label}</span>
        {count ? <span className="count">{count}</span> : null}
        <svg className="caret" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="subnav-list">
          {screens.map((x) => (
            <Link key={x.id} href={x.route} className={`subnav ${x.n === activeN ? "active" : ""}`} aria-current={x.id === currentId ? "page" : undefined}>
              {MENU_LABEL[x.n] ?? x.name}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
