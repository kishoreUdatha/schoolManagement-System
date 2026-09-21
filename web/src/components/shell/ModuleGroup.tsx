"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { MODULES, SCREENS } from "@/lib/screens";

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
  const screens = SCREENS.filter((x) => mods.includes(MODULES.indexOf(x.module)));
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
