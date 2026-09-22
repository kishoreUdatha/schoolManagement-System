"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { MODULES, SCREENS } from "@/lib/screens";

/**
 * Screens that are not starting points: a form opened from a list's "Add"
 * button, or a page about one record (?id=). They stay reachable from those
 * buttons and links, from search and from the catalogue, but the menu lists
 * only lists, dashboards, calendars and setup pages. While you are on one, it
 * shows in its group so you can see where you are.
 */
const NOT_IN_MENU = new Set([
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
]);

/**
 * One module in the menu: a heading that opens to list the module's screens.
 * Open/closed is React state, not the <details> element's own, so a group
 * the user toggled cannot drift out of step with the page. Arriving on a
 * module opens its group; the others keep whatever the user chose.
 */
export function ModuleGroup({
  label,
  icon,
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
  const screens = SCREENS.filter((x) => mods.includes(MODULES.indexOf(x.module)) && (!NOT_IN_MENU.has(x.n) || x.id === currentId));
  const here = mods.includes(MODULES.indexOf(currentModule));
  const [open, setOpen] = useState(here);

  useEffect(() => {
    if (here) setOpen(true);
  }, [here, currentId]);

  return (
    <div className={`nav-group tone-${tone % 6} ${open ? "open" : ""}`}>
      <button type="button" className={`nav ${here ? "active" : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name={icon} />
        <span>{label}</span>
        {count ? <span className="count">{count}</span> : null}
        <svg className="caret" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="subnav-list">
          {screens.map((x) => (
            <Link key={x.id} href={x.route} className={`subnav ${x.id === currentId ? "active" : ""}`} aria-current={x.id === currentId ? "page" : undefined}>
              {x.name}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
