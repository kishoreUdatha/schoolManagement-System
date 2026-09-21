"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { MODULES, SCREENS } from "@/lib/screens";

const ROLES = ["School Admin", "Teacher", "Student", "Parent", "Principal", "Accountant", "Super Admin"];

/** The screen catalogue from the mock pack's index.html, linking to live pages. */
export function Gallery() {
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [mod, setMod] = useState(() => MODULES[Number(params.get("module"))] ?? "");
  const [role, setRole] = useState("");

  const found = useMemo(() => {
    const q = query.toLowerCase().trim();
    return SCREENS.filter(
      (s) =>
        (!q || `${s.id} ${s.name} ${s.module} ${s.role}`.toLowerCase().includes(q)) &&
        (!mod || s.module === mod) &&
        (!role || s.role.toLowerCase().includes(role.toLowerCase())),
    );
  }, [query, mod, role]);

  return (
    <main className="gallery">
      <header className="gallery-header">
        <Link href="/screens" className="brand">
          <span className="brand-mark">
            <Icon name="book" />
          </span>
          <span>
            BrightCampus<small>SCHOOL ERP</small>
          </span>
        </Link>
        <nav className="gallery-controls">
          <Link href="/">Landing page</Link>
          <Link href="/welcome/sign-in">Sign in</Link>
        </nav>
      </header>
      <div className="gallery-title">
        <div>
          <h1>A brighter school experience.</h1>
          <p>Explore the complete School ERP screen collection, organized by module and role.</p>
        </div>
        <div className="gallery-meta">
          {`${SCREENS.length} screens · ${MODULES.length} modules`}
          <br />
          <span className="small muted">Sample data until each screen is wired to the API</span>
        </div>
      </div>
      <section className="gallery-filter">
        <div className="filterbar">
          <div className="searchbox">
            <Icon name="search" className="sm" />
            <input
              aria-label="Search screens"
              placeholder="Search by screen name, module, role or SCR ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select aria-label="Filter module" value={mod} onChange={(e) => setMod(e.target.value)}>
            <option value="">{`All ${MODULES.length} modules`}</option>
            {MODULES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select aria-label="Filter role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="spread small muted">
          <span>{`${found.length} of ${SCREENS.length} screens`}</span>
          <span>Open a screen to explore it</span>
        </div>
      </section>
      <section className="gallery-grid">
        {found.map((s) => (
          <article className="gallery-card" key={s.id}>
            <div className="card-label">
              <span className="screen-id">{s.id}</span>
              <h3>
                <Link href={s.route}>{s.name}</Link>
              </h3>
              <div className="card-footer">
                <span>{s.moduleShort}</span>
                <span>{s.role}</span>
              </div>
            </div>
          </article>
        ))}
      </section>
      <footer className="gallery-footer">
        All information shown is sample data. Production authentication, APIs, payments and message delivery are connected screen by screen.
      </footer>
    </main>
  );
}
