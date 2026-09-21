// How far is the frontend wired to the backend? One line per screen, plus
// the backend endpoints nothing in the frontend calls.
//
//   node scripts/integration_report.mjs [http://localhost:8000] > report.txt
//
// Per screen: the page and every src/ file it imports (transitively) are read.
//   live      — the code calls the API (api.* / useApi / fetch("/api/...)).
//   hooks     — mock preview hooks still present (data-action, main-form…),
//               meaning some buttons only fake their behaviour.
//   sample    — the mock's sample people or figures still in the code.
//   gaps      — "Not wired" notes left where the API has nothing to call.
// Endpoints: every literal "/api/v1/..." string in src/ is matched against
// the OpenAPI spec; spec paths never matched are listed as unused.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = process.argv[2] ?? "http://localhost:8000";
const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(WEB, "src");
const spec = await (await fetch(`${BACKEND}/openapi.json`)).json();

const screensTs = fs.readFileSync(path.join(SRC, "lib/screens.ts"), "utf8");
const SCREENS = [...screensTs.matchAll(/^\s*(\{"id".*\}),?$/gm)].map((m) => JSON.parse(m[1]));

const read = (f) => fs.readFileSync(f, "utf8");
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return base + ext;
  return null;
}
const SHARED = ["lib/", "components/ui/", "components/shell/", "components/preview/"].map((p) => path.join(SRC, p));
function closure(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const m of read(file).matchAll(/from\s+["']([^"']+)["']/g)) {
    const f = resolveImport(file, m[1]);
    // shared infrastructure does not count as the screen's own wiring
    if (f && !SHARED.some((s) => f.startsWith(s))) closure(f, seen);
  }
  return seen;
}

const HOOKS = /data-action=|data-submit-main|id="main-form"|data-view-row|data-table-search|data-filter-col|data-approve|data-mark-present|data-auth-verify|data-read-all|data-conversation/;
const SAMPLE = /Aarav Sharma|Meera Sharma|Ananya Rao|Kavya Reddy|Bright International|BC-26-0\d|₹8\.42L|1,248|Priya Nair|Rohit Verma/;
const LIVE = /\bapi\.(get|post|put|patch|delete)\b|\buseApi\b|fetch\(\s*[`"']\/api\//;

const rows = [];
for (const s of SCREENS) {
  const page = s.route === "/" ? path.join(SRC, "app/page.tsx") : path.join(SRC, "app/(screens)", s.route.slice(1), "page.tsx");
  const files = [...closure(page)];
  const text = files.map(read).join("\n");
  const pageText = read(page);
  const gaps = [...text.matchAll(/Not wired:?\s*([^\n*]{0,90})/g)].map((m) => m[1].trim().replace(/\s*\*\/.*$/, ""));
  rows.push({
    id: s.id,
    name: s.name,
    module: s.moduleShort,
    marked: pageText.includes("// Wired:"),
    live: LIVE.test(text),
    hooks: (text.match(new RegExp(HOOKS, "g")) ?? []).length,
    sample: (text.match(new RegExp(SAMPLE, "g")) ?? []).slice(0, 3),
    gaps,
  });
}

// ---- endpoints
const all = fs.readdirSync(SRC, { recursive: true }).filter((f) => /\.tsx?$/.test(f)).map((f) => read(path.join(SRC, f))).join("\n");
const literals = new Set();
for (const m of all.matchAll(/[`"'](\/api\/v1\/[^`"'?\s]*)/g)) literals.add(m[1].replace(/\$\{[^}]*\}/g, "X"));
// bases like `${base}/x` where base is one of several literals: also keep suffixes
const suffixes = new Set();
for (const m of all.matchAll(/\$\{[a-zA-Z_.]+\}(\/[a-z][^`"'?\s]*)/g)) suffixes.add(m[1].replace(/\$\{[^}]*\}/g, "X"));

const endpoints = [];
for (const [p, ops] of Object.entries(spec.paths)) {
  const re = new RegExp("^" + p.replace(/\{[^}]+\}/g, "[^/]+") + "$");
  const tail = p.replace(/^\/api\/v1\/[^/]+(\/me)?/, "");
  const used = [...literals].some((l) => re.test(l)) || [...suffixes].some((s) => s.length > 3 && new RegExp(p.replace(/\{[^}]+\}/g, "[^/]+").replace(/^.*?(?=\/[a-z])/, "") + "$").test(s) && tail && p.endsWith(s.replace(/X/g, "").split("/").filter(Boolean).pop() ?? "~"));
  for (const m of Object.keys(ops)) endpoints.push({ p, m: m.toUpperCase(), used });
}

// ---- print
const pad = (s, n) => String(s).padEnd(n);
const byStatus = { live: 0, notLive: 0, unmarked: 0, hooks: 0, sample: 0, gaps: 0 };
console.log("SCREENS\n");
console.log(pad("id", 8) + pad("module", 20) + pad("name", 42) + "status");
for (const r of rows) {
  const flags = [];
  if (!r.marked) flags.push("NOT MARKED WIRED"), byStatus.unmarked++;
  if (!r.live) flags.push("NO API CALLS"), byStatus.notLive++;
  else byStatus.live++;
  if (r.hooks) flags.push(`${r.hooks} preview hook(s)`), byStatus.hooks++;
  if (r.sample.length) flags.push(`sample data: ${r.sample.join(", ")}`), byStatus.sample++;
  if (r.gaps.length) flags.push(`${r.gaps.length} gap(s)`), byStatus.gaps++;
  console.log(pad(r.id, 8) + pad(r.module, 20) + pad(r.name.slice(0, 40), 42) + (flags.join("; ") || "live"));
}
console.log(`\n${rows.length} screens: ${byStatus.live} call the API, ${byStatus.notLive} do not; ${byStatus.unmarked} not marked wired; ${byStatus.hooks} with preview hooks; ${byStatus.sample} with sample data; ${byStatus.gaps} with noted gaps.`);

console.log("\nGAPS NOTED IN CODE (API has nothing to call)\n");
for (const r of rows) for (const g of [...new Set(r.gaps)]) console.log(`${r.id}  ${g}`);

const unused = endpoints.filter((e) => !e.used);
console.log(`\nENDPOINTS: ${endpoints.length} in the backend, ${endpoints.length - unused.length} called by the frontend, ${unused.length} never called.\n`);
const groups = {};
for (const e of unused) (groups[e.p.split("/")[3]] ??= []).push(`${e.m} ${e.p}`);
for (const [g, list] of Object.entries(groups)) {
  console.log(`[${g}] ${list.length}`);
  for (const l of list) console.log("  " + l);
}
