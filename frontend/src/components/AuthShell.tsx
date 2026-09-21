"use client";

import Link from "next/link";
import { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The two-column frame every sign-in, reset and public form sits in.
 *
 *  BrightCampus splits the page 52/48: a tinted panel carrying the brand and
 *  a line about the product, and a white column holding the form. Below the
 *  large breakpoint it collapses to the form alone — a phone has no room for
 *  a manifesto, and the person is here to get in.
 *
 *  The mock fills the left panel with an illustration. There isn't one in
 *  this codebase and drawing one is not a layout change, so the panel keeps
 *  its copy and its colour.
 */
export function AuthShell({
  title,
  subtitle,
  topRight,
  footer,
  children,
  headline = "Every school day.\nA little brighter.",
  blurb = "One place for learning, teaching, and everything else a school runs on.",
}: {
  /** The form's own heading — "Welcome back", "Choose a new password". */
  title: string;
  subtitle?: ReactNode;
  /** The line above the form: which school, and how to leave it. */
  topRight?: ReactNode;
  /** The quiet line under everything — who to ask when this does not work. */
  footer?: ReactNode;
  children: ReactNode;
  headline?: string;
  blurb?: string;
}) {
  return (
    <div className="grid min-h-screen bg-surface-raised lg:grid-cols-[52%_48%]">
      {/* The brand half. Hidden on a phone rather than stacked above the
          form, so the first thing on screen is the thing you came to do. */}
      <section className="relative hidden flex-col overflow-hidden bg-surface-soft px-[65px] py-10 lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-[38px] w-[35px] -rotate-[4deg] place-items-center rounded-[10px] bg-brand-600 text-[15px] font-extrabold text-white">
            B
          </span>
          <span className="text-[21px] font-extrabold leading-none tracking-[-0.9px] text-ink">
            BrightCampus
            <small className="mt-1 block text-[9px] font-bold uppercase tracking-[1.4px] text-ink-muted">
              School ERP
            </small>
          </span>
        </Link>

        <div className="mt-24 max-w-[440px]">
          <h2 className="whitespace-pre-line text-[38px] font-extrabold leading-[1.15] tracking-[-1.6px] text-ink">
            {headline}
          </h2>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">{blurb}</p>
        </div>

        <span className="mt-auto pt-10 text-[10px] font-bold uppercase tracking-[0.7px] text-ink-subtle">
          BrightCampus · Connected school life
        </span>
      </section>

      {/* The form half. */}
      <main className="flex flex-col px-6 py-8 sm:px-10 lg:px-[65px] lg:py-10">
        {topRight && <div className="text-right text-[11px] text-ink-muted">{topRight}</div>}

        <div className="m-auto w-full max-w-[390px]">
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">
            {title}
          </h1>
          {subtitle && <p className="mt-1.5 text-[13px] text-ink-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>

        {footer && (
          <div className="mt-auto pt-10 text-center text-[10px] text-ink-subtle">{footer}</div>
        )}
      </main>
    </div>
  );
}

/** The row under a password field: remember me on the left, the way out on
 *  the right. Its own component because four screens want the same thing. */
export function AuthRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 text-[12px]", className)}>
      {children}
    </div>
  );
}
