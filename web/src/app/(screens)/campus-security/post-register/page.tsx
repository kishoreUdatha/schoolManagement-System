// NEW-106 · Post Register
// Module: Visitor / Gate / Security · Role: Receptionist · Release: Extension
// New screen (no mock)
// Wired: GET/POST /api/v1/school/front-desk/post, POST /post/{id}/handed. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { PostRegister } from "@/features/security/FrontOffice";

export const metadata = { title: "NEW-106 · Post Register · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-106">
      <PostRegister />
    </AppShell>
  );
}
