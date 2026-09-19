"use client";

import { GalleryViewer } from "@/components/events/Gallery";
import { PageHeader } from "@/components/ui/Field";

export default function TeacherGalleryPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Photo gallery" />
      <GalleryViewer base="/api/v1/school/gallery" />
    </div>
  );
}
