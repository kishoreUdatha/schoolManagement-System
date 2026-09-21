// NEW-025 · Gallery & Videos
// Module: Events / PTM / Communication · Role: School Admin · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /school/gallery and /school/videos — Albums, photos, publish; learning videos
// Wired: GET/POST /api/v1/school/gallery, GET/PUT/DELETE /gallery/{id} (?album=), POST /gallery/{id}/publish, POST /gallery/{id}/photos (multipart), PATCH/DELETE /gallery/photos/{id}, GET /gallery/photos/{id}/file; GET /school/videos, DELETE /school/videos/{id}; teacher GET/POST /teacher/videos, DELETE /teacher/videos/{id}, GET /teacher/my-classes. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { GalleryHeadAction, GalleryVideos } from "@/features/gallery/GalleryVideos";

export const metadata = { title: "NEW-025 · Gallery & Videos · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-025"
      actions={
        <Suspense>
          <GalleryHeadAction />
        </Suspense>
      }
    >
      <Suspense>
        <GalleryVideos />
      </Suspense>
    </AppShell>
  );
}
