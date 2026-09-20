"use client";

import { createContext, useContext } from "react";

/** Every page in this portal, for the topbar's search box. */
export type SearchablePage = { label: string; href: string; section?: string | null };

/** What the sidebar and the topbar have to agree on.
 *
 *  Context rather than props: the layouts that assemble the two are server
 *  components, and a server component cannot hand a client component a
 *  setter — there is nothing to serialise a function into. It also keeps the
 *  nav's own page list on the client side of the boundary, where it is a real
 *  array rather than a module reference.
 *
 *  `open` is the mobile drawer: the button that opens it lives in the topbar
 *  and the drawer itself lives in the sidebar, so neither can own the state.
 *
 *  `pages` is published by the sidebar from the sections it is already
 *  rendering, so search finds exactly what the nav shows — a page somebody
 *  can see in the sidebar and cannot find in the search box is the worse
 *  failure, and a second hand-kept list is how that happens.
 *
 *  Null when no shell is present, which is how a sidebar knows it is standing
 *  alone and should keep its own mobile bar.
 */
export type NavShell = {
  open: boolean;
  setOpen: (v: boolean) => void;
  pages: SearchablePage[];
  publishPages: (p: SearchablePage[]) => void;
};

export const NavShellContext = createContext<NavShell | null>(null);

export function useNavShell(): NavShell | null {
  return useContext(NavShellContext);
}
