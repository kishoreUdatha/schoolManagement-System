// Reading a students file in the browser, before anything is sent.
//
// POST /students/bulk takes typed rows: a date the server cannot read, or a
// gender outside male/female/other, fails the whole request with a 422. So
// every row is checked here first, and only the good ones are sent; the
// server then checks names (missing, too short, repeated) row by row.

import type { BulkRow, Gender } from "./types";

/** The most rows one request may carry (StudentBulkCreate.students maxItems). */
export const MAX_ROWS = 200;

export const COLUMNS = [
  "full_name", "gender", "dob", "blood_group", "address", "photo_url",
  "father_name", "father_phone", "father_email", "father_occupation",
  "mother_name", "mother_phone", "mother_email", "mother_occupation",
  "primary_contact",
] as const;
type Column = (typeof COLUMNS)[number];

const ALIASES: Record<string, Column> = {
  name: "full_name",
  student_name: "full_name",
  full_name: "full_name",
  gender: "gender",
  sex: "gender",
  dob: "dob",
  date_of_birth: "dob",
  birth_date: "dob",
  blood_group: "blood_group",
  blood: "blood_group",
  address: "address",
  photo_url: "photo_url",
  photo: "photo_url",
  // the family, in the same file
  father_name: "father_name",
  father: "father_name",
  father_phone: "father_phone",
  father_mobile: "father_phone",
  father_email: "father_email",
  father_occupation: "father_occupation",
  mother_name: "mother_name",
  mother: "mother_name",
  mother_phone: "mother_phone",
  mother_mobile: "mother_phone",
  mother_email: "mother_email",
  mother_occupation: "mother_occupation",
  primary_contact: "primary_contact",
  first_contact: "primary_contact",
};

/** Split CSV (or tab-separated, as pasted from a spreadsheet) into cells, honouring quotes. */
export function splitCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** A row read from the file: its line number, what will be sent, and what is wrong with it. */
export type ParsedRow = { line: number; data: BulkRow; problems: string[] };

export type Parsed = { rows: ParsedRow[]; unknown: string[]; error: string | null };

function toGender(v: string): Gender | null | undefined {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (["m", "male", "boy"].includes(t)) return "male";
  if (["f", "female", "girl"].includes(t)) return "female";
  if (["o", "other"].includes(t)) return "other";
  return undefined; // not readable
}

/** YYYY-MM-DD, or DD-MM-YYYY / DD/MM/YYYY as Indian offices write it. undefined = not a date. */
function toIsoDate(v: string): string | null | undefined {
  const t = v.trim();
  if (!t) return null;
  let y: number, m: number, d: number;
  let hit = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else {
    hit = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (!hit) return undefined;
    [d, m, y] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Read the file, map its header, and check each row the way the server will. */
export function parseStudents(text: string): Parsed {
  const table = splitCsv(text);
  if (!table.length) return { rows: [], unknown: [], error: null };
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const index: Partial<Record<Column, number>> = {};
  const unknown: string[] = [];
  header.forEach((h, i) => {
    const col = ALIASES[h];
    if (col && index[col] === undefined) index[col] = i;
    else if (h) unknown.push(table[0][i].trim());
  });
  if (index.full_name === undefined) {
    return { rows: [], unknown, error: "The first line must be a header with a full_name column (see the template)." };
  }

  const seen = new Map<string, number>();
  const rows = table.slice(1).map((cells, i): ParsedRow => {
    const cell = (c: Column) => (index[c] === undefined ? "" : (cells[index[c]!] ?? "").trim());
    const problems: string[] = [];
    const name = cell("full_name").replace(/\s+/g, " ");
    if (name.length < 2) problems.push("Full name is missing or too short");
    else {
      const key = name.toLowerCase();
      if (seen.has(key)) problems.push(`Same name as line ${seen.get(key)}`);
      else seen.set(key, i + 2);
    }
    const gender = toGender(cell("gender"));
    if (gender === undefined) problems.push(`Gender "${cell("gender")}" is not male, female or other`);
    const dob = toIsoDate(cell("dob"));
    if (dob === undefined) problems.push(`Date of birth "${cell("dob")}" is not a date (use YYYY-MM-DD)`);
    else if (dob && dob > todayIso()) problems.push("Date of birth is in the future");
    const blood = cell("blood_group").toUpperCase().replace(/\s+/g, "");
    if (blood.length > 10) problems.push("Blood group is longer than 10 characters");
    const photo = cell("photo_url");
    if (photo.length > 500) problems.push("Photo URL is longer than 500 characters");
    // A parent named with no mobile number cannot be saved as a contact, so
    // the row is held back rather than importing the child without the family.
    for (const who of ["father", "mother"] as const) {
      if (cell(`${who}_name`) && !cell(`${who}_phone`)) problems.push(`${who === "father" ? "Father" : "Mother"} has no mobile number`);
    }
    const first = cell("primary_contact").toLowerCase();
    if (first && first !== "father" && first !== "mother") problems.push(`First contact "${cell("primary_contact")}" must be father or mother`);
    return {
      line: i + 2,
      problems,
      data: {
        full_name: name || null,
        gender: gender ?? null,
        dob: dob ?? null,
        blood_group: blood || null,
        address: cell("address") || null,
        photo_url: photo || null,
        father_name: cell("father_name") || null,
        father_phone: cell("father_phone") || null,
        father_email: cell("father_email") || null,
        father_occupation: cell("father_occupation") || null,
        mother_name: cell("mother_name") || null,
        mother_phone: cell("mother_phone") || null,
        mother_email: cell("mother_email") || null,
        mother_occupation: cell("mother_occupation") || null,
        primary_contact: first || null,
      },
    };
  });
  return { rows, unknown, error: null };
}
