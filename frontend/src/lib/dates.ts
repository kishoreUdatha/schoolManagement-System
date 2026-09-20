/** Dates the API sends as plain "YYYY-MM-DD", rendered as the day they mean.
 *
 *  `new Date("2026-09-30")` parses as UTC midnight, so anywhere west of
 *  Greenwich it renders as the 29th. On a datesheet or an admit card that is
 *  not a cosmetic bug: it tells a child to sit an exam on the wrong day.
 *  Splitting the string and building a local date keeps the day put, because
 *  a school day has no timezone — it is just a square on a calendar.
 */
export function localDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "Tuesday 30 September" — for a heading somebody reads once. */
export function longDate(iso: string): string {
  return localDate(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "30 Sep" — for a table column, where the weekday is noise. */
export function shortDate(iso: string): string {
  return localDate(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/** "30 Sep 2026" — where the year matters, such as a printed card. */
export function readableDate(iso: string): string {
  return localDate(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** "09:00" from "09:00:00". The API sends seconds; nobody reads them. */
export const hhmm = (t: string): string => t.slice(0, 5);

/** The day part of a full timestamp, rendered readably.
 *
 *  The API sends dates as "YYYY-MM-DD" but timestamps as ISO with a time on
 *  the end. Handing one of those to the helpers above yields Invalid Date,
 *  quietly, in the middle of a page — so timestamps come through here rather
 *  than every caller remembering to trim the string first.
 */
export function dateTime(iso: string): string {
  return readableDate(iso.slice(0, 10));
}

/** Days until a date, negative once it has passed. Null for no date.
 *
 *  Both sides are floored to local midnight, so "expires today" is 0 rather
 *  than a fraction that rounds either way depending on the time of day — a
 *  certificate should not appear to expire tomorrow because it is 11pm.
 */
export function daysLeft(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = localDate(iso).getTime();
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((then - midnight) / 86_400_000);
}
