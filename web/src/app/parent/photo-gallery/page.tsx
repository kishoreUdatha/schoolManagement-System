// PM-103 · Photo gallery
// Parent app · Module: Events & activities · Release: Phase 2 · ERP: NEW-025
// Feature: Browse the photo albums the school shares with parents.
// Mock: none (the Parent Mobile pack has no gallery screen); built in the pack's style.
// Wired: GET /api/v1/parent/me/gallery, GET …/gallery/{album_id}, GET …/gallery/photos/{photo_id}/file. ?album= opens one album. Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { PhotoGallery } from "@/features/parent/events/PhotoGallery";

export const metadata = { title: "PM-103 · Photo gallery · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={103}>
      <Suspense>
        <PhotoGallery />
      </Suspense>
    </ParentShell>
  );
}
