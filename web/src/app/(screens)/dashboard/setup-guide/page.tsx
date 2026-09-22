// The setup wizard moved to School Settings (SCR-289); old links land there.

import { redirect } from "next/navigation";

export default function Page() {
  redirect("/settings/school-settings");
}
