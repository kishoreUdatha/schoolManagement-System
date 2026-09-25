"use client";

/*
 * The phone frame shared by the mobile apps (parent, teacher, student): the
 * header (back, title, a right-hand button), an optional bar under it (the
 * parent's child bar), the scrolling body, the five-tab bottom navigation,
 * the "More" menu and the toast. It comes from the Parent Mobile pack, so it
 * uses the pack's ids and classes and its styles in parent.css (scoped under
 * .pm). Each app's shell decides what goes in it: tabs, menu items, who may
 * see which screen.
 */

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type ReactNode } from "react";

const ICONS: Record<string, string> = {
  home: "M3 10 12 3l9 7v10H7V10m3 10v-6h5v6",
  learn: "M3 4h7c1.5 0 2 .7 2 2 0-1.3.5-2 2-2h7v16h-7c-1.5 0-2-.7-2-2 0 1.3-.5 2-2 2H3zM12 6v12",
  fees: "M4 6h16v14H4zM4 6V4h13M14 11h7v5h-7z",
  inbox: "M3 5h18v13H8l-5 3zM7 9h10M7 13h7",
  back: "m14 5-7 7 7 7M7 12h13",
  bell: "M6 10a6 6 0 0 1 12 0v5l2 3H4l2-3zM10 21h4",
  close: "m6 6 12 12M18 6 6 18",
  today: "M4 5h16v15H4zM4 10h16M9 3v4M15 3v4M8 14h3v3H8z",
  attendance: "M9 7a3 3 0 1 0 0 .1M3 20v-2c0-3 3-5 6-5s6 2 6 5v2M16 11l2 2 4-4",
  homework: "M5 3h10l5 5v13H5zM15 3v6h5M8 12h8M8 16h6",
  marks: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  timetable: "M3 5h18v15H3zM3 10h18M9 10v10M15 10v10",
};

export function Ico({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "more" ? (
        <>
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </>
      ) : (
        <path d={ICONS[name]} />
      )}
    </svg>
  );
}

export type FrameTab = { key: string; label: string; active: boolean; onPress: () => void };
export type FrameMenuItem = { label: string; onPress: () => void };

/** A toast for the frame: `notify(message)` shows it for a few seconds. */
export function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const notify = useCallback((m: string) => {
    setToast(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  return { toast, notify };
}

export function MobileFrame({
  screen,
  title,
  showHeader,
  headerRight,
  subBar,
  noNav,
  tabs,
  menu,
  onSignOut,
  toast,
  onBodyClick,
  children,
}: {
  /** Written to data-screen, which some per-screen styles key on. */
  screen: number | string;
  title: string;
  showHeader: boolean;
  headerRight?: ReactNode;
  subBar?: ReactNode;
  /** Hide the bottom navigation (sign-in and account screens). */
  noNav: boolean;
  /** Tabs with key "more" open the menu instead of calling onPress. */
  tabs: FrameTab[];
  menu: FrameMenuItem[];
  onSignOut: () => void;
  toast: string | null;
  onBodyClick?: (e: React.MouseEvent) => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="pm">
      <div className={`phone ${noNav ? "no-nav" : ""}`} data-screen={screen} onClick={onBodyClick}>
        {showHeader ? (
          <header id="app-header">
            <button className="icon-button" aria-label="Go back" onClick={() => router.back()}>
              <Ico name="back" />
            </button>
            <h2>{title}</h2>
            {headerRight ?? <span style={{ width: 38 }} />}
          </header>
        ) : null}
        {subBar}
        <div className="scroll-body" id="screen-body">
          {children}
        </div>
        {!noNav ? (
          <nav id="bottom-nav" aria-label="Main navigation">
            {tabs.map((t) => (
              <button key={t.key} className={t.active ? "active" : ""} onClick={() => (t.key === "more" ? setOpen(true) : t.onPress())}>
                <Ico name={t.key} />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        ) : null}
        <div id="pm-toast" className={toast ? "visible" : ""} role="status" aria-live="polite">
          {toast}
        </div>
        {open ? (
          <div id="more-menu">
            <div className="between">
              <h2>More</h2>
              <button className="icon-button" aria-label="Close menu" onClick={() => setOpen(false)}>
                <Ico name="close" />
              </button>
            </div>
            {menu.map((m) => (
              <button
                key={m.label}
                className="item"
                onClick={() => {
                  setOpen(false);
                  m.onPress();
                }}
              >
                <strong>{m.label}</strong>
                <span>›</span>
              </button>
            ))}
            <button className="item" onClick={onSignOut}>
              <strong>Sign out</strong>
              <span>›</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
