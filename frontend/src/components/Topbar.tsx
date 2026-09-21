"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChevronDown, Menu, MessageSquare, Search } from "lucide-react";

import { useAcademicYear } from "@/components/AcademicYearProvider";
import { useNavShell } from "@/components/NavShellContext";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";

type Hit = { label: string; detail?: string | null; href: string; kind: string };

/** Where a person found in search opens, per role.
 *
 *  Doubles as the gate on searching people at all: the directory is open to
 *  every school-side role, but only these two portals have a student page to
 *  land on, and a result that opens a 404 is worse than no result. A role
 *  absent from this map searches pages only. */
/** Roles the staff inbox is open to — everyone but parents, students and
 *  the platform admin, matching the guard the endpoint itself applies. */
const INBOX_ROLES = new Set(["school_admin", "principal", "accountant", "teacher", "staff"]);

const STUDENT_HREF: Record<string, (id: number) => string> = {
  school_admin: (id) => `/school/students/${id}`,
  teacher: (id) => `/teacher/students/${id}`,
};

interface TopbarProps {
  /** Offer the academic-year picker. School admin only, because every route
   *  under /school/academic-years is. */
  showYear?: boolean;
  /** Where the bell and the envelope go for this role. */
  noticesHref?: string;
  messagesHref?: string;
}

export function Topbar({ showYear = false, noticesHref, messagesHref }: TopbarProps) {
  const shell = useNavShell();
  const ay = useAcademicYear();
  // The pages search looks through are whatever the sidebar published. Held
  // steady when there is no shell, because it is a search effect's dependency.
  const pages = useMemo(() => shell?.pages ?? [], [shell?.pages]);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const user = auth.getUser();

  // The dot on the bell. Two inboxes, and two roles with neither: a student
  // has no notice inbox of their own, and the platform admin sits above any
  // one school's, so they are not asked a question that would be refused.
  useEffect(() => {
    const role = user?.role ?? "";
    const path =
      role === "parent"
        ? "/api/v1/parent/me/notices/unread-count"
        : INBOX_ROLES.has(role)
          ? "/api/v1/staff/inbox/unread-count"
          : null;
    if (!path) return;
    api
      .get<{ unread: number }>(path)
      .then((r) => setUnread(r.data.unread))
      .catch(() => setUnread(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⌘K / Ctrl-K, because a search you have to reach for with a mouse is a
  // search people stop using by the second week.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const lower = term.toLowerCase();
    const pageHits: Hit[] = pages
      .filter((p) => p.label.toLowerCase().includes(lower))
      .slice(0, 6)
      .map((p) => ({ label: p.label, detail: p.section ?? null, href: p.href, kind: "Page" }));
    setHits(pageHits);
    setOpen(true);

    // People come from the directory, for the roles that can open one.
    const href = STUDENT_HREF[user?.role ?? ""];
    if (!href) return;
    const t = setTimeout(() => {
      api
        .get<{ id: number; full_name: string; admission_no?: string; section_label?: string | null }[]>(
          "/api/v1/school/directory/students",
          { params: { search: term, limit: 5 } }
        )
        .then((r) =>
          setHits([
            ...pageHits,
            ...r.data.map((s) => ({
              label: s.full_name,
              detail: [s.admission_no, s.section_label].filter(Boolean).join(" · "),
              href: href(s.id),
              kind: "Student",
            })),
          ])
        )
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pages]);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  const initials = (user?.full_name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-4 border-b border-surface-border bg-surface-raised px-4 md:px-7">
      {shell && (
        <button
          type="button"
          onClick={() => shell.setOpen(true)}
          aria-label="Open navigation"
          className="rounded-control border border-surface-control p-2 text-ink-muted hover:bg-surface-hover hover:text-ink md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      <div ref={boxRef} className="relative min-w-0 flex-1 md:max-w-[340px]">
        <div className="flex items-center gap-2 rounded-input border border-surface-control bg-surface-raised px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-300">
          <Search className="h-4 w-4 shrink-0 text-ink-subtle" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => q.trim().length > 1 && setOpen(true)}
            aria-label="Search"
            placeholder="Search people, classes, pages…"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-surface-border px-1.5 py-0.5 text-[10px] font-bold text-ink-subtle sm:block">
            Ctrl K
          </kbd>
        </div>

        {open && hits.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-surface-border bg-surface-raised shadow-lg">
            {hits.map((h, i) => (
              <button
                key={`${h.kind}-${h.href}-${i}`}
                type="button"
                onClick={() => go(h.href)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-hover"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold text-ink">{h.label}</span>
                  {h.detail && (
                    <span className="block truncate text-[11px] text-ink-subtle">{h.detail}</span>
                  )}
                </span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-ink-subtle">
                  {h.kind}
                </span>
              </button>
            ))}
          </div>
        )}
        {open && q.trim().length > 1 && hits.length === 0 && (
          <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-lg border border-surface-border bg-surface-raised px-3 py-3 text-[12px] text-ink-subtle shadow-lg">
            Nothing matching “{q.trim()}”.
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {showYear && ay && ay.years.length > 0 && ay.yearId !== null && (
          <>
            <select
              aria-label="Academic year"
              value={ay.yearId}
              onChange={(e) => ay.setYearId(Number(e.target.value))}
              className="hidden rounded-input border border-surface-control bg-surface-raised px-2.5 py-1.5 text-[12px] font-bold text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 lg:block"
            >
              {ay.years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.is_current ? " (current)" : ""}
                </option>
              ))}
            </select>
            <span className="hidden h-6 w-px bg-surface-border lg:block" />
          </>
        )}

        {noticesHref && (
          <Link
            href={noticesHref}
            aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
            className="relative rounded-lg p-2 text-ink-muted hover:bg-surface-hover hover:text-ink"
          >
            <Bell className="h-[18px] w-[18px]" />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-surface-raised" />
            )}
          </Link>
        )}
        {messagesHref && (
          <Link
            href={messagesHref}
            aria-label="Messages"
            className="rounded-lg p-2 text-ink-muted hover:bg-surface-hover hover:text-ink"
          >
            <MessageSquare className="h-[18px] w-[18px]" />
          </Link>
        )}

        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-[11px] font-extrabold text-brand-600">
          {initials}
        </span>
        <ChevronDown className="hidden h-4 w-4 text-ink-subtle sm:block" />
      </div>
    </header>
  );
}
