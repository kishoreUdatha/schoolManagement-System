export type Kind = "single" | "multiple" | "true_false" | "numeric" | "short";
export type Bloom = "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
export type Difficulty = "easy" | "medium" | "hard";
export type Option = { key: string; text: string };

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
  answer: { keys?: string[]; value?: number; tolerance?: number; model_answer?: string };
  explanation: string | null;
  marks: string;
  bloom_level: Bloom;
  difficulty: Difficulty;
  is_active: boolean;
  used_in_tests: number;
};

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
  result_visibility: "on_submit" | "after_close" | "hidden";
  status: "draft" | "published" | "closed";
  is_open: boolean;
  question_count: number;
  total_marks: string;
  attempts: number;
  can_edit: boolean;
  by_bloom: Partial<Record<Bloom, string>>;
};

export type TestDetail = TestRead & { questions: (Question & { test_marks: string; sequence: number })[] };

export type PaperQuestion = {
  question_id: number;
  number: number;
  kind: Kind;
  text: string;
  options: Option[];
  marks: string;
  response: { keys?: string[]; value?: number; text?: string };
};

export type ReviewQuestion = PaperQuestion & {
  correct: Question["answer"];
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
  status: "in_progress" | "submitted" | "graded";
  submitted_at: string | null;
  auto_submitted: boolean;
  visible: boolean;
  score?: string | null;
  max_score?: string | null;
  percent?: number | null;
  pending_grading?: number;
  questions?: ReviewQuestion[];
};

export const BLOOMS: Bloom[] = ["remember", "understand", "apply", "analyze", "evaluate", "create"];
export const KINDS: { value: Kind; label: string }[] = [
  { value: "single", label: "Multiple choice (one answer)" },
  { value: "multiple", label: "Multiple choice (several answers)" },
  { value: "true_false", label: "True / false" },
  { value: "numeric", label: "Numeric answer" },
  { value: "short", label: "Short answer (teacher marks)" },
];
export const kindLabel = (k: Kind) => KINDS.find((x) => x.value === k)?.label ?? k;
export const bloomTone: Record<Bloom, string> = {
  remember: "bg-sky-500",
  understand: "bg-teal-500",
  apply: "bg-emerald-500",
  analyze: "bg-amber-500",
  evaluate: "bg-orange-500",
  create: "bg-rose-500",
};
export const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function formatAnswer(q: { kind: Kind; options: Option[] }, a: { keys?: string[]; value?: number; text?: string; model_answer?: string } | undefined) {
  if (!a) return "—";
  if (q.kind === "numeric") return a.value === undefined ? "—" : String(a.value);
  if (q.kind === "short") return a.text ?? a.model_answer ?? "—";
  const keys = a.keys ?? [];
  if (!keys.length) return "—";
  return keys.map((k) => `${k}. ${q.options.find((o) => o.key === k)?.text ?? ""}`).join("; ");
}
