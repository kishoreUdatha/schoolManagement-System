// The mobile app's front door: parents, teachers and students pick who they
// are and go to their own sign-in. Anyone already signed in goes straight
// to their app's home. The Android shell (mobile/) opens this page.

import { AppEntry } from "@/features/teacherapp/AppEntry";

export default function Page() {
  return <AppEntry />;
}
