"use client";

import { GalleryViewer } from "@/components/events/Gallery";
import { PageHeader } from "@/components/ui/Field";

export default function ParentGalleryPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Photo gallery" subtitle="Photos from school events." />
      <GalleryViewer base="/api/v1/parent/me/gallery" />
    </div>
  );
}
