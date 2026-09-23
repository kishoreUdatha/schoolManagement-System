// Screens that share one menu entry and switch with a row of tabs on the page.
// The menu lists only the group's first screen, under the group's name; the
// others stay out of the menu (ModuleGroup) and appear as tabs (AppShell).

export type TabGroup = { label: string; tabs: [number, string][] };

export const TAB_GROUPS: TabGroup[] = [
  {
    label: "Users & roles",
    tabs: [[284, "Users"], [285, "Roles"], [286, "Permissions"], [287, "Permission matrix"], [288, "Role assignment"]],
  },
  {
    label: "Preferences",
    tabs: [[290, "Academic"], [291, "Notifications"], [1082, "WhatsApp"], [292, "Integrations"], [293, "Security"]],
  },
  {
    label: "Data & audit",
    tabs: [[294, "Audit log"], [295, "Import / export / backup"], [1081, "Data exports"]],
  },
];

/** The group a screen belongs to, if any. */
export function tabGroupOf(n: number | undefined): TabGroup | undefined {
  return n === undefined ? undefined : TAB_GROUPS.find((g) => g.tabs.some(([t]) => t === n));
}

/** Menu names that differ from the screen's own name. */
export const MENU_LABEL: Record<number, string> = {
  44: "Enquiry",
  289: "School setup",
  ...Object.fromEntries(TAB_GROUPS.map((g) => [g.tabs[0][0], g.label])),
};

/** Menu entries that go first in their module (the rest keep catalogue order). */
export const MENU_FIRST = new Set([289]);
