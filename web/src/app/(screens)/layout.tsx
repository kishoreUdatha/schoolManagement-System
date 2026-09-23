// The chrome for every school-side screen. It sits in a layout so that moving
// between screens changes only the content: the sidebar keeps its scroll
// position and open groups, and the top bar is not rebuilt.

import type { ReactNode } from "react";
import { ShellFrame } from "@/components/shell/ShellFrame";

export default function ScreensLayout({ children }: { children: ReactNode }) {
  return <ShellFrame>{children}</ShellFrame>;
}
