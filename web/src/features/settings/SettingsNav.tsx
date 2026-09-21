import Link from "next/link";
import { routeOf } from "@/lib/screens";

const LINKS: [number, string][] = [
  [289, "School profile"],
  [290, "Academic settings"],
  [291, "Notifications"],
  [285, "Roles & permissions"],
  [292, "Integrations"],
  [293, "Security"],
  [294, "Audit log"],
];

/** The settings side menu from the mocks, with the current screen marked. */
export function SettingsNav({ active }: { active: number }) {
  return (
    <nav className="settings-nav">
      {LINKS.map(([n, t]) => (
        <Link key={n} href={routeOf(n)} className={n === active ? "active" : ""}>
          {t}
        </Link>
      ))}
    </nav>
  );
}
