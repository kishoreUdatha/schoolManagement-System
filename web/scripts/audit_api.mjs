// Check every api.get/post/put/patch/delete call in src/ against the live
// OpenAPI spec: that the path and method exist, that a request body built
// as an object literal names real fields and every required one, and that
// GET query parameters are ones the endpoint reads.
//
//   node scripts/audit_api.mjs [http://localhost:8000]
//
// Static: it sees literal paths and object literals. A call it cannot read
// (a path in a variable, a body built elsewhere) is listed as unchecked.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const BACKEND = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:8000";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const spec = await (await fetch(`${BACKEND}/openapi.json`)).json();

const routes = Object.entries(spec.paths).map(([p, ops]) => ({
  p,
  re: new RegExp("^" + p.replace(/\{[^}]+\}/g, "[^/]+") + "$"),
  ops,
}));

function resolveRef(s) {
  while (s && s.$ref) s = spec.components.schemas[s.$ref.split("/").pop()];
  if (s && s.anyOf) s = s.anyOf.find((x) => x.$ref || x.properties) ?? s;
  while (s && s.$ref) s = spec.components.schemas[s.$ref.split("/").pop()];
  return s;
}

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const f = path.join(dir, d.name);
    return d.isDirectory() ? files(f) : /\.tsx?$/.test(d.name) ? [f] : [];
  });
}

// String constants anywhere in src/, by name, for paths built as `${BASE}/x`.
const GLOBAL_CONSTS = new Map();

function constValue(name, sf, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  let found;
  sf.forEachChild(function walk(n) {
    if (found !== undefined) return;
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === name && n.initializer) found = pathOf(n.initializer, sf, seen);
    n.forEachChild(walk);
  });
  if (found !== undefined && found !== null) return found;
  return GLOBAL_CONSTS.get(name) ?? null;
}

/** The path argument as a string with \u0000 for unknown parts, or null. */
function pathOf(node, sf, seen = new Set()) {
  if (!node) return null;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return pathOf(node.expression, sf, seen);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let s = node.head.text;
    for (const span of node.templateSpans) {
      const e = span.expression;
      const v = ts.isIdentifier(e) ? constValue(e.text, sf, new Set(seen)) : null;
      s += (v !== null && !v.includes("\u0000") && v.startsWith("/") ? v : v !== null && !v.includes("/") && !v.includes("\u0000") ? v : "\u0000") + span.literal.text;
    }
    return s;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = pathOf(node.left, sf, seen), b = pathOf(node.right, sf, seen);
    return (a ?? "\u0000") + (b ?? "\u0000");
  }
  if (ts.isIdentifier(node)) return constValue(node.text, sf, seen);
  return null;
}

function objectKeys(node) {
  if (!node || !ts.isObjectLiteralExpression(node)) return null;
  let spread = false;
  const keys = [];
  for (const p of node.properties) {
    if (ts.isSpreadAssignment(p)) spread = true;
    else if (p.name) keys.push(p.name.getText().replace(/^["']|["']$/g, ""));
  }
  return { keys, spread };
}

for (const file of files(ROOT)) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  sf.forEachChild((n) => {
    if (ts.isVariableStatement(n))
      for (const d of n.declarationList.declarations)
        if (d.initializer && (ts.isStringLiteral(d.initializer) || ts.isNoSubstitutionTemplateLiteral(d.initializer)) && d.initializer.text.startsWith("/api/"))
          GLOBAL_CONSTS.set(d.name.getText(sf), d.initializer.text);
  });
}

const USED = new Set();
const issues = [];
const unchecked = [];
let calls = 0;

for (const file of files(ROOT)) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes("api.") && !text.includes("useApi")) continue;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rel = path.relative(path.dirname(ROOT), file).replace(/\\/g, "/");
  sf.forEachChild(function walk(n) {
    const viaHook = ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "useApi";
    if (viaHook && n.arguments[0] && ts.isConditionalExpression(n.arguments[0])) {
      // useApi(ready ? "/api/..." : null): check the path branch
      n.arguments[0] = n.arguments[0].whenTrue.kind === ts.SyntaxKind.NullKeyword ? n.arguments[0].whenFalse : n.arguments[0].whenTrue;
    }
    if (viaHook || (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.expression.getText(sf) === "api")) {
      const FILE = { upload: "post", blob: "get", download: "get", open: "get" };
      const method = viaHook ? "get" : (FILE[n.expression.name.text] ?? n.expression.name.text);
      if (["get", "post", "put", "patch", "delete"].includes(method) && n.arguments.length) {
        calls++;
        const where = `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
        const raw = pathOf(n.arguments[0], sf);
        if (raw === null) {
          unchecked.push(`${where}  ${method.toUpperCase()} ${n.arguments[0].getText(sf).slice(0, 60)}`);
        } else {
          const clean = raw.split("?")[0];
          const pattern = new RegExp("^" + clean.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\u0000/g, "[^/]+") + "$");
          // a literal path matches a spec path when the spec's regex accepts the literal with placeholders filled
          const probe = clean.replace(/\u0000/g, "X1");
          const hit = routes.filter((r) => r.re.test(probe) || pattern.test(r.p.replace(/\{[^}]+\}/g, "X1")));
          const shown = clean.replace(/\u0000/g, "{…}");
          if (!hit.length) issues.push(`${where}  ${method.toUpperCase()} ${shown}  — no such path`);
          else {
            const route = hit.find((r) => r.ops[method]) ;
            if (route) USED.add(`${method.toUpperCase()} ${route.p}`);
            // a path with an unresolved middle part may match several spec paths
            for (const r of hit) if (r.ops[method] && raw.includes("\u0000")) USED.add(`${method.toUpperCase()} ${r.p}`);
            if (!route) issues.push(`${where}  ${method.toUpperCase()} ${shown}  — path exists, method not allowed (${Object.keys(hit[0].ops).join(", ")})`);
            else {
              const op = route.ops[method];
              if (method === "get" && n.arguments[1]) {
                const q = objectKeys(n.arguments[1]);
                const allowed = new Set((op.parameters ?? []).filter((p) => p.in === "query").map((p) => p.name));
                if (q) for (const k of q.keys) if (!allowed.has(k)) issues.push(`${where}  GET ${shown}  — query "${k}" is not read by the endpoint`);
              }
              if (["post", "put", "patch"].includes(method)) {
                const schema = resolveRef(op.requestBody?.content?.["application/json"]?.schema);
                const body = objectKeys(n.arguments[1]);
                if (schema?.properties && body) {
                  const props = new Set(Object.keys(schema.properties));
                  for (const k of body.keys) if (!props.has(k)) issues.push(`${where}  ${method.toUpperCase()} ${shown}  — body field "${k}" is not in ${op.requestBody.content["application/json"].schema.$ref?.split("/").pop() ?? "the schema"}`);
                  if (!body.spread)
                    for (const r of schema.required ?? []) if (!body.keys.includes(r)) issues.push(`${where}  ${method.toUpperCase()} ${shown}  — required field "${r}" is missing`);
                } else if (schema?.properties && n.arguments[1] && !body) {
                  unchecked.push(`${where}  ${method.toUpperCase()} ${shown}  (body built elsewhere)`);
                } else if (!schema && op.requestBody?.required && !n.arguments[1] && method !== "delete") {
                  issues.push(`${where}  ${method.toUpperCase()} ${shown}  — endpoint needs a body, none sent`);
                }
              }
            }
          }
        }
      }
    }
    n.forEachChild(walk);
  });
}

if (process.argv.includes("--used")) {
  fs.writeFileSync(process.argv[process.argv.indexOf("--used") + 1], [...USED].sort().join("\n"));
}
console.log(`${calls} api calls read.`);
console.log(`\nPROBLEMS (${issues.length})`);
for (const i of issues) console.log("  " + i);
console.log(`\nNOT CHECKED STATICALLY (${unchecked.length})`);
for (const u of unchecked) console.log("  " + u);
