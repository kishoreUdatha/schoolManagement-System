"use client";

import { ChevronDown, LucideIcon, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import { useBranding } from "@/components/BrandingProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
  exact?: boolean;
  badge?: ReactNode;
};

export type NavSection = {
  /** Section heading. `null` = flush top section, no heading, not collapsible. */
  heading: string | null;
  /** Icon shown next to the collapsible heading (ignored for headless top section). */
  icon?: LucideIcon;
  items: NavItem[];
};

export interface SidebarProps {
  brandTitle: string;
  brandHref: string;
  sections: NavSection[];
  loginPath: string;
  /** Story 21.1 — short label after the brand name (e.g. "School", "Teacher"). */
  portalLabel?: string;
}

function itemMatches(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export function Sidebar({
  brandTitle,
  brandHref,
  sections,
  loginPath,
  portalLabel,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const user = auth.getUser();
  const branding = useBranding();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Compose the displayed title from branding + portal label, falling back
  // to whatever the wrapper passed in.
  const displayTitle = (() => {
    const app = branding?.app_name?.trim();
    if (app && portalLabel) return `${app} · ${portalLabel}`;
    if (app) return app;
    return brandTitle;
  })();
  const initial = (branding?.app_name?.trim()?.[0] ?? brandTitle.trim()?.[0] ?? "S").toUpperCase();

  // Section open/closed state — default ALL sections open so the user
  // sees every item on first paint. They can still collapse individual
  // sections by clicking the heading.
  const initialOpen = (): Record<string, boolean> => {
    const map: Record<string, boolean> = {};
    for (const s of sections) {
      if (s.heading) map[s.heading] = true;
    }
    return map;
  };
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    initialOpen
  );

  // Re-evaluate auto-expand on navigation: open the section containing the
  // newly-active item, leave the others as-is so user choices are preserved.
  useEffect(() => {
    setOpenSections((prev) => {
      const next = { ...prev };
      for (const s of sections) {
        if (!s.heading) continue;
        const hasActive = s.items.some((i) => itemMatches(pathname, i));
        if (hasActive) next[s.heading] = true;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggle(heading: string) {
    setOpenSections((s) => ({ ...s, [heading]: !s[heading] }));
  }

  function logout() {
    auth.clear();
    router.push(loginPath);
  }

  function renderItem(item: NavItem) {
    const active = itemMatches(pathname, item);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "group relative flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] leading-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
          active
            ? "bg-surface-hover font-medium text-ink"
            : "text-ink-muted hover:bg-surface-hover hover:text-ink"
        )}
      >
        {active && (
          <span className="absolute inset-y-0.5 left-0 w-[2px] rounded-r-full bg-brand-500 shadow-glow-sm" />
        )}
        {Icon && (
          <Icon
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              active
                ? "text-brand-400"
                : "text-ink-subtle group-hover:text-ink-muted"
            )}
            strokeWidth={1.75}
          />
        )}
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge && <span>{item.badge}</span>}
      </Link>
    );
  }

  const navContent = (
    <nav className="flex h-full flex-col bg-surface-raised/95 backdrop-blur-sm">
      {/* Brand header */}
      <div className="flex items-center gap-2 border-b border-surface-border px-2.5 py-2.5">
        {branding?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logo_url}
            alt={branding.name}
            className="h-6 w-6 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700 text-[11px] font-bold text-white shadow-glow-sm">
            {initial}
          </div>
        )}
        <Link
          href={brandHref}
          className="truncate text-[12px] font-semibold tracking-tight text-ink"
          onClick={() => setMobileOpen(false)}
        >
          {displayTitle}
        </Link>
      </div>

      {/* Sections */}
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {sections.map((section, i) => {
          if (!section.heading) {
            // Flat top section — items always visible, no collapse control.
            return (
              <div key={i} className="space-y-0.5 pb-1">
                {section.items.map(renderItem)}
              </div>
            );
          }

          const open = openSections[section.heading] ?? false;
          const SectionIcon = section.icon;
          const hasActive = section.items.some((it) =>
            itemMatches(pathname, it)
          );

          return (
            <div key={i} className="space-y-0.5">
              <button
                type="button"
                onClick={() => toggle(section.heading!)}
                className={cn(
                  "group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                  "text-ink-muted hover:bg-surface-hover hover:text-ink"
                )}
                aria-expanded={open}
              >
                {SectionIcon && (
                  <SectionIcon
                    className="h-3.5 w-3.5 shrink-0 text-ink-muted group-hover:text-ink"
                    strokeWidth={1.75}
                  />
                )}
                <span className="flex-1 text-left">{section.heading}</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                    open ? "rotate-0" : "-rotate-90"
                  )}
                  strokeWidth={2}
                />
              </button>
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out",
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}
              >
                <div className="overflow-hidden">
                  <div className="space-y-0.5 pb-1 pl-3">
                    {section.items.map(renderItem)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* User footer */}
      <div className="border-t border-surface-border px-3 py-2.5">
        {user && (
          <div className="mb-1.5 flex items-center gap-2 text-xs">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/30 to-brand-700/30 text-[9px] font-semibold uppercase text-ink ring-1 ring-surface-border">
              {initials(user.full_name)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[11px] font-medium text-ink">
                {user.full_name}
              </div>
              <div className="truncate text-[10px] text-ink-subtle">
                {user.email}
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={logout}
            className="flex-1 rounded-md border border-surface-border bg-surface-subtle px-2.5 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:border-surface-hover hover:bg-surface-hover hover:text-ink"
          >
            Sign out
          </button>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-surface-border bg-surface-raised/95 px-4 py-2 backdrop-blur-sm md:hidden print:hidden">
        <Link
          href={brandHref}
          className="flex items-center gap-2 text-sm font-semibold text-ink"
        >
          {branding?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logo_url}
              alt={branding.name}
              className="h-7 w-7 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
              {initial}
            </span>
          )}
          {displayTitle}
        </Link>
        <button
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          className="rounded-md border border-surface-border bg-surface-subtle p-1.5 text-ink-muted hover:text-ink"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {/* Desktop sidebar — pinned to viewport height so the footer
          (user info, sign out, theme toggle) is always visible even on
          tall main content pages. */}
      <aside className="sticky top-0 hidden h-screen w-44 shrink-0 border-r border-surface-border md:flex md:flex-col print:hidden">
        {navContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <aside
            className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-surface-border shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-2 z-10 rounded-md p-1 text-ink-muted hover:bg-surface-hover hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
}

export function NavBadge({
  children,
  tone = "rose",
}: {
  children: ReactNode;
  tone?: "rose" | "brand" | "amber" | "emerald";
}) {
  const tones: Record<string, string> = {
    rose: "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/30",
    brand: "bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/30",
    amber: "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30",
    emerald: "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30",
  };
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}
