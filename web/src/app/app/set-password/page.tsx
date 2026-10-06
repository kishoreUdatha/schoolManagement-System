// The phone apps' first-sign-in password screen (teachers and parents; the
// student app has its own). Opened with ?next= the app page to go on to.

import { Suspense } from "react";
import { AppSetPassword } from "@/features/teacherapp/AppSetPassword";

export default function Page() {
  return (
    <Suspense>
      <AppSetPassword />
    </Suspense>
  );
}
