"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { useBranding } from "@/components/BrandingProvider";
import { useNavShell } from "@/components/NavShellContext";

/** The trail above every page title in the mocks: school / section / page.
 *
 *  Derived from the route and the nav the portal already publishes, rather
 *  than declared per page. Two hundred and ninety-six pages each passing
 *  their own crumbs is two hundred and ninety-six chances to disagree with
 *  the sidebar they are sitting next to.
 *
 *  A segment that matches a nav entry gets that entry's label and link; one
 *  that does not is title-cased and left as text, which is what happens to
 *  record ids and leaf pages that never appear in a menu.
 */
function titleCase(segment: string): string {
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const branding = useBranding();
  const shell = useNavShell();
  const pages = shell?.pages ?? [];

  const crumbs = useMemo(() => {
    if (!pathname) return [];
    const parts = pathname.split("/").filter(Boolean);
    // The first segment is the portal itself; the sidebar already says which
    // one you are in, so it is the school's name that belongs here instead.
    const rest = parts.slice(1);

    const out: { label: string; href?: string }[] = [];
    let href = `/${parts[0]}`;
    rest.forEach((part, i) => {
      href += `/${part}`;
      const match = pages.find((p) => p.href === href);
      const last = i === rest.length - 1;
      if (match) {
        // The section this page sits under, named once, above it.
        if (match.section && !out.some((c) => c.label === match.section)) {
          out.push({ label: match.section });
        }
        out.push({ label: match.label, href: last ? undefined : href });
      } else {
        out.push({ label: titleCase(part), href: undefined });
      }
    });
    return out;
  }, [pathname, pages]);

  // On a portal's own landing page there is nowhere to have come from.
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-muted">
        {branding?.name && (
          <li className="flex items-center gap-x-2">
            <span className="truncate">{branding.name}</span>
            <span aria-hidden="true" className="text-ink-subtle">
              /
            </span>
          </li>
        )}
        {crumbs.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-x-2">
            {c.href ? (
              <Link href={c.href} className="truncate hover:text-brand-600 hover:underline">
                {c.label}
              </Link>
            ) : (
              <span
                className="truncate"
                aria-current={i === crumbs.length - 1 ? "page" : undefined}
              >
                {c.label}
              </span>
            )}
            {i < crumbs.length - 1 && (
              <span aria-hidden="true" className="text-ink-subtle">
                /
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
