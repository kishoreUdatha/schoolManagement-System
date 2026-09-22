/** A parent–teacher conversation (GET /parent/me/conversations). */
export type Conversation = {
  id: number;
  teacher_user_id: number;
  teacher_name: string | null;
  student_id: number;
  student_name: string | null;
  last_message_at: string | null;
  last_message_body: string | null;
  unread_for_viewer: number;
  is_closed?: boolean;
  created_at: string;
};

export type Message = {
  id: number;
  sender_user_id: number | null;
  sender_name: string | null;
  sender_role: string | null;
  body: string;
  attachment_url: string | null;
  created_at: string;
};

export type TeacherContact = { teacher_user_id: number; teacher_name: string; subjects: string[] };
