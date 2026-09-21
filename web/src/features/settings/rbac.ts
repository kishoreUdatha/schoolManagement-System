import { label } from "@/lib/format";
import type { Permission, Role } from "./types";

/** Portals a custom role may sign in through (as the old frontend offered). */
export const BASE_ROLES = ["teacher", "staff", "principal", "accountant", "parent"] as const;

export const ROLES = "/api/v1/school/roles";

/** The catalogue grouped by module, modules in alphabetical order. */
export function byModule(perms: Permission[]): [string, Permission[]][] {
  const m = new Map<string, Permission[]>();
  perms.forEach((p) => m.set(p.module, [...(m.get(p.module) ?? []), p]));
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** PUT /roles/{id} replaces the whole role, so its own values go back with the new permission list. */
export function roleBody(r: Role, permissions: string[]) {
  return { name: r.name, code: r.code, description: r.description, base_role: r.base_role, is_active: r.is_active, permissions };
}

export const roleKind = (r: Role) => (r.is_system ? "Built-in" : "Custom role");
export const signsInAs = (r: Role) => label(r.base_role);
