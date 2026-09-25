"use client";

/*
 * The parent app's service grid, laid out like a payments app's home: titled
 * cards of round icon tiles, four to a row. Home shows the quick-access row
 * and every section; the More menu shows every section. One list, so a new
 * screen is added in one place.
 */

type Tone = "blue" | "purple" | "amber" | "rose" | "green" | "teal";
export type MenuTile = { label: string; n: number; icon: string; tone: Tone };
export type MenuSection = { title: string; tiles: MenuTile[] };

/** 24×24 stroke icons, drawn to sit inside the round tile. */
const ICON: Record<string, string> = {
  attendance: "M9 7a3 3 0 1 0 0 .1M3 20v-2c0-3 3-5 6-5s6 2 6 5v2M16 11l2 2 4-4",
  homework: "M5 3h10l5 5v13H5zM15 3v6h5M8 12h8M8 16h6",
  timetable: "M3 5h18v15H3zM3 10h18M9 10v10M15 10v10",
  exams: "M6 3h12v18H6zM9 7h6M9 11h6M9 15h3",
  results: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  test: "M4 4h16v12H4zM8 20h8M12 16v4M8 9l2 2 4-4",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21a2 2 0 0 1 2-2h13",
  project: "M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.5-.8z",
  progress: "M3 17l6-6 4 4 8-8M15 7h6v6",
  leave: "M4 5h16v15H4zM4 10h16M9 3v4M15 3v4M9 15l2 2 4-4",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  clock: "M12 3a9 9 0 1 0 .1 0M12 7v5l3 2",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  health: "M12 20s-8-4.5-8-10a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 5.5-8 10-8 10zM12 9v5M9.5 11.5h5",
  bus: "M5 4h14v12H5zM5 11h14M7 19v2M17 19v2M5 16v3h14v-3M8 14h.01M16 14h.01",
  pin: "M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12zM12 11a2 2 0 1 0 0-.1",
  wallet: "M3 7h18v13H3zM3 7l3-4h12l3 4M16 13h3",
  receipt: "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h3",
  swap: "M4 8h14l-3-3M20 16H6l3 3",
  library: "M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.5-.8 3 15.6-3.5.8z",
  hostel: "M3 21V9l9-6 9 6v12M3 21h18M9 21v-6h6v6",
  meal: "M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 3-3 6s1 4 3 4v8",
  chat: "M3 5h18v13H8l-5 3zM7 9h10M7 13h7",
  notice: "M4 10v4h3l6 4V6L7 10zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12",
  calendar: "M4 5h16v15H4zM4 10h16M9 3v4M15 3v4",
  event: "M4 5h16v15H4zM4 10h16M9 3v4M15 3v4M12 13l1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 19l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z",
  ptm: "M8 8a3 3 0 1 0 0-.1M16 8a3 3 0 1 0 0-.1M2 20c0-3 2.7-5 6-5s6 2 6 5M14 15.2c.6-.1 1.3-.2 2-.2 3.3 0 6 2 6 5",
  photo: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 8.5h.01",
  feedback: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z",
  help: "M12 3a9 9 0 1 0 .1 0M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14M12 17h.01",
  document: "M6 3h9l4 4v14H6zM14 3v5h5",
  certificate: "M5 3h14v12H5zM8 7h8M8 10h5M10 15l-2 6 4-2 4 2-2-6",
  behaviour: "M12 3a9 9 0 1 0 .1 0M8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01",
  children: "M9 7a3 3 0 1 0 0 .1M17 8a2.5 2.5 0 1 0 0 .1M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c.6-.3 1.3-.5 2-.5 2.8 0 4 2 4 5",
  student: "M12 3l10 5-10 5L2 8zM6 10v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5",
  person: "M12 8a4 4 0 1 0 0-.1M4 21c0-4 3.6-7 8-7s8 3 8 7",
  settings: "M12 9a3 3 0 1 0 .1 0M19 12l2-1-1-3-2.2.2-1.2-1.6.6-2.1-2.7-1.4L13 4h-2l-1.5-1.9-2.7 1.4.6 2.1L6.2 7.2 4 7l-1 3 2 1v2l-2 1 1 3 2.2-.2 1.2 1.6-.6 2.1 2.7 1.4L11 20h2l1.5 1.9 2.7-1.4-.6-2.1 1.2-1.6L20 17l1-3-2-1z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
};

export const QUICK_ACCESS: MenuTile[] = [
  { label: "Attendance", n: 9, icon: "attendance", tone: "blue" },
  { label: "Homework", n: 14, icon: "homework", tone: "purple" },
  { label: "Pay fees", n: 23, icon: "wallet", tone: "amber" },
  { label: "Timetable", n: 18, icon: "timetable", tone: "rose" },
  { label: "Results", n: 21, icon: "results", tone: "green" },
  { label: "Messages", n: 35, icon: "chat", tone: "teal" },
  { label: "Track bus", n: 30, icon: "bus", tone: "blue" },
  { label: "Apply leave", n: 12, icon: "leave", tone: "purple" },
];

export const MENU_SECTIONS: MenuSection[] = [
  {
    title: "Learning",
    tiles: [
      { label: "Homework", n: 14, icon: "homework", tone: "purple" },
      { label: "Timetable", n: 18, icon: "timetable", tone: "purple" },
      { label: "Exams", n: 19, icon: "exams", tone: "purple" },
      { label: "Results", n: 21, icon: "results", tone: "purple" },
      { label: "Online tests", n: 101, icon: "test", tone: "purple" },
      { label: "Study material", n: 56, icon: "book", tone: "purple" },
      { label: "Projects", n: 58, icon: "project", tone: "purple" },
      { label: "Weekly progress", n: 55, icon: "progress", tone: "purple" },
    ],
  },
  {
    title: "Fees & payments",
    tiles: [
      { label: "Pay fees", n: 23, icon: "wallet", tone: "amber" },
      { label: "Receipts", n: 27, icon: "receipt", tone: "amber" },
      { label: "Change bus stop", n: 32, icon: "swap", tone: "amber" },
    ],
  },
  {
    title: "Attendance & safety",
    tiles: [
      { label: "Attendance", n: 9, icon: "attendance", tone: "blue" },
      { label: "Apply leave", n: 12, icon: "leave", tone: "blue" },
      { label: "Leave requests", n: 11, icon: "list", tone: "blue" },
      { label: "Early pickup", n: 50, icon: "clock", tone: "blue" },
      { label: "Pickup people", n: 49, icon: "shield", tone: "blue" },
      { label: "Health", n: 43, icon: "health", tone: "blue" },
      { label: "Transport", n: 29, icon: "pin", tone: "blue" },
      { label: "Track bus", n: 30, icon: "bus", tone: "blue" },
    ],
  },
  {
    title: "Connect with school",
    tiles: [
      { label: "Messages", n: 35, icon: "chat", tone: "teal" },
      { label: "Notices", n: 33, icon: "notice", tone: "teal" },
      { label: "Calendar", n: 37, icon: "calendar", tone: "teal" },
      { label: "Events", n: 38, icon: "event", tone: "teal" },
      { label: "Book PTM", n: 39, icon: "ptm", tone: "teal" },
      { label: "Photos", n: 103, icon: "photo", tone: "teal" },
      { label: "Feedback", n: 54, icon: "feedback", tone: "teal" },
      { label: "Help desk", n: 44, icon: "help", tone: "teal" },
    ],
  },
  {
    title: "School services",
    tiles: [
      { label: "Documents", n: 41, icon: "document", tone: "green" },
      { label: "Certificates", n: 42, icon: "certificate", tone: "green" },
      { label: "Behaviour", n: 57, icon: "behaviour", tone: "green" },
      { label: "Library", n: 51, icon: "library", tone: "green" },
      { label: "Hostel", n: 52, icon: "hostel", tone: "green" },
      { label: "Meal menu", n: 53, icon: "meal", tone: "green" },
    ],
  },
  {
    title: "Family & account",
    tiles: [
      { label: "My children", n: 5, icon: "children", tone: "rose" },
      { label: "Student profile", n: 8, icon: "student", tone: "rose" },
      { label: "My profile", n: 47, icon: "person", tone: "rose" },
      { label: "Settings", n: 48, icon: "settings", tone: "rose" },
      { label: "Link a child", n: 4, icon: "link", tone: "rose" },
    ],
  },
];

export function TileGrid({ tiles, onPick }: { tiles: MenuTile[]; onPick: (n: number) => void }) {
  return (
    <div className="tile-grid">
      {tiles.map((t) => (
        <button key={`${t.n}-${t.label}`} className="tile" onClick={() => onPick(t.n)}>
          <span className={`tile-ico ${t.tone}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICON[t.icon]} />
            </svg>
          </span>
          <span className="tile-label">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Every section as a titled card of tiles. */
export function MenuSections({ onPick }: { onPick: (n: number) => void }) {
  return (
    <>
      {MENU_SECTIONS.map((s) => (
        <section key={s.title} className="tile-card">
          <h3>{s.title}</h3>
          <TileGrid tiles={s.tiles} onPick={onPick} />
        </section>
      ))}
    </>
  );
}
