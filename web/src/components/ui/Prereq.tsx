"use client";

import Link from "next/link";
import { Icon } from "./Icon";
import { routeOf } from "@/lib/screens";

/**
 * A line at the top of a screen that cannot do its job yet, because something
 * upstream has not been set up. It says what is missing and links to the
 * screen that fixes it; when nothing is missing it draws nothing.
 */
export function Prereq({ missing, children, screen, cta }: { missing: boolean; children: string; screen: number; cta: string }) {
  if (!missing) return null;
  return (
    <div className="tip warn prereq" role="status">
      <Icon name="bell" className="sm" />
      <span style={{ flex: 1 }}>{children}</span>
      <Link href={routeOf(screen)} className="btn sm">
        {cta}
      </Link>
    </div>
  );
}
