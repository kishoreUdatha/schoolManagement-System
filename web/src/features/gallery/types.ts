// Shapes returned by /api/v1/school/gallery/*, /school/videos and /teacher/videos.

import type { EventAudience } from "@/features/communication/shared";

export type Album = {
  id: number;
  title: string;
  description: string | null;
  album_date: string;
  event_id: number | null;
  audience: EventAudience;
  class_id: number | null;
  section_id: number | null;
  audience_label: string;
  is_published: boolean;
  photo_count: number;
  cover_photo_id: number | null;
};

export type Photo = { id: number; caption: string | null; content_type: string; size_bytes: number };

export type AlbumDetail = Album & { photos: Photo[] };

export type Video = {
  id: number;
  class_subject_id: number;
  subject_name: string | null;
  subject_code: string | null;
  class_name: string | null;
  title: string;
  description: string | null;
  youtube_video_id: string;
  youtube_url: string;
  thumbnail_url: string;
  embed_url: string;
  teacher_user_id: number;
  teacher_name: string | null;
  is_active: boolean;
  created_at: string;
  completion_count: number;
  eligible_student_count: number;
};

export type TeacherClasses = {
  subject_teacher_of: { class_subject_id: number; class_name: string; subject_name: string; is_current_year: boolean }[];
};
