import Link from "next/link";
import { routeOf } from "@/lib/screens";

const LINKS: [number, string][] = [
  [289, "School profile"],
  [290, "Academic settings"],
  [291, "Notifications"],
  [285, "Roles & permissions"],
  [292, "Integrations"],
  [1082, "WhatsApp"],
  [293, "Security"],
  [294, "Audit log"],
];

/** The settings screens as a row of tabs, with the current one marked. */
export function SettingsNav({ active }: { active: number }) {
  return (
    <nav className="module-tabs settings-tabs" aria-label="Settings">
      {LINKS.map(([n, t]) => (
        <Link key={n} href={routeOf(n)} className={n === active ? "active" : ""}>
          {t}
        </Link>
      ))}
    </nav>
  );
}
