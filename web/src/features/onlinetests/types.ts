// Shapes returned by /api/v1/school/questions, /school/online-tests and
// /school/test-attempts (backend app/schemas/online_exam.py).

export type Kind = "single" | "multiple" | "true_false" | "numeric" | "short";
export type Bloom = "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
export type Difficulty = "easy" | "medium" | "hard";
export type Option = { key: string; text: string };

/** Choice kinds: keys; numeric: value ± tolerance; short: model answer (key) or text (response). */
export type Answer = { keys?: string[]; value?: number | null; tolerance?: number; model_answer?: string; text?: string };

export type Question = {
  id: number;
  subject_id: number;
  subject_name: string;
  class_level: string | null;
  chapter_id: number | null;
  chapter_title: string | null;
  topic: string | null;
  kind: Kind;
  text: string;
  options: Option[];
  answer: Answer;
  explanation: string | null;
  marks: string;
  bloom_level: Bloom;
  difficulty: Difficulty;
  is_active: boolean;
  used_in_tests: number;
};

export type QuestionPage = { total: number; items: Question[]; by_bloom: Record<string, number> };

export type TestStatus = "draft" | "published" | "closed";
export type Visibility = "on_submit" | "after_close" | "hidden";

export type TestRead = {
  id: number;
  class_subject_id: number;
  class_name: string;
  subject_id: number;
  subject_name: string;
  section_id: number | null;
  audience_label: string;
  title: string;
  instructions: string | null;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  negative_marking: string;
  result_visibility: Visibility;
  status: TestStatus;
  is_open: boolean;
  question_count: number;
  total_marks: string;
  attempts: number;
  can_edit: boolean;
  by_bloom: Partial<Record<Bloom, string>>;
};

export type TestDetail = TestRead & { questions: (Question & { test_marks: string; sequence: number })[] };

export type AttemptStatus = "in_progress" | "submitted" | "graded";

export type AttemptRow = {
  student_id: number;
  student_name: string;
  section_label: string;
  attempt_id: number | null;
  status: AttemptStatus | null;
  started_at: string | null;
  submitted_at: string | null;
  auto_submitted: boolean;
  score: string | null;
  max_score: string | null;
  percent: number | null;
  pending_grading: number;
};

export type QuestionStat = {
  question_id: number;
  sequence: number;
  text: string;
  kind: Kind;
  bloom_level: Bloom;
  answered: number;
  correct: number;
  percent_correct: number | null;
  avg_marks: string | null;
};

export type TestResults = {
  test: TestRead;
  eligible: number;
  attempted: number;
  average_percent: number | null;
  highest: string | null;
  lowest: string | null;
  rows: AttemptRow[];
  questions: QuestionStat[];
  blooms: { bloom_level: Bloom; max_marks: string; avg_percent: number | null }[];
};

export type ReviewQuestion = {
  question_id: number;
  number: number;
  kind: Kind;
  text: string;
  options: Option[];
  marks: string;
  response: Answer;
  correct: Answer;
  explanation: string | null;
  is_correct: boolean | null;
  marks_awarded: string | null;
  teacher_comment: string | null;
  bloom_level: Bloom;
};

export type AttemptResult = {
  attempt_id: number;
  test_id: number;
  title: string;
  student_id: number;
  student_name: string;
  status: AttemptStatus;
  submitted_at: string | null;
  auto_submitted: boolean;
  visible: boolean;
  score?: string | null;
  max_score?: string | null;
  percent?: number | null;
  pending_grading?: number;
  questions?: ReviewQuestion[];
};

/** GET /school/syllabus rows: a class-subject with its sections. */
export type ClassSubjectRow = {
  class_subject_id: number;
  class_id: number;
  class_name: string;
  subject_id: number;
  subject_name: string;
  can_edit: boolean;
  sections: { section_id: number; section_label: string }[];
};
