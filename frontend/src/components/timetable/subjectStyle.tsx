import {
  Activity,
  BookOpen,
  Calculator,
  FlaskConical,
  Globe,
  Heart,
  Landmark,
  Leaf,
  Library,
  Lightbulb,
  Monitor,
  Music,
  Palette,
  Star,
  type LucideIcon,
} from "lucide-react";

type Tone = { card: string; icon: string };

// Full class strings so Tailwind's JIT keeps them.
const TONES: Record<string, Tone> = {
  rose: {
    card: "bg-rose-50 border-rose-100 dark:bg-rose-500/10 dark:border-rose-500/20",
    icon: "text-rose-500 bg-white/80 dark:bg-rose-500/15 dark:text-rose-300",
  },
  sky: {
    card: "bg-sky-50 border-sky-100 dark:bg-sky-500/10 dark:border-sky-500/20",
    icon: "text-sky-600 bg-white/80 dark:bg-sky-500/15 dark:text-sky-300",
  },
  emerald: {
    card: "bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20",
    icon: "text-emerald-600 bg-white/80 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  amber: {
    card: "bg-amber-50 border-amber-100 dark:bg-amber-500/10 dark:border-amber-500/20",
    icon: "text-amber-600 bg-white/80 dark:bg-amber-500/15 dark:text-amber-300",
  },
  violet: {
    card: "bg-violet-50 border-violet-100 dark:bg-violet-500/10 dark:border-violet-500/20",
    icon: "text-violet-600 bg-white/80 dark:bg-violet-500/15 dark:text-violet-300",
  },
  fuchsia: {
    card: "bg-fuchsia-50 border-fuchsia-100 dark:bg-fuchsia-500/10 dark:border-fuchsia-500/20",
    icon: "text-fuchsia-600 bg-white/80 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
  },
  teal: {
    card: "bg-teal-50 border-teal-100 dark:bg-teal-500/10 dark:border-teal-500/20",
    icon: "text-teal-600 bg-white/80 dark:bg-teal-500/15 dark:text-teal-300",
  },
  indigo: {
    card: "bg-indigo-50 border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20",
    icon: "text-indigo-600 bg-white/80 dark:bg-indigo-500/15 dark:text-indigo-300",
  },
  orange: {
    card: "bg-orange-50 border-orange-100 dark:bg-orange-500/10 dark:border-orange-500/20",
    icon: "text-orange-600 bg-white/80 dark:bg-orange-500/15 dark:text-orange-300",
  },
  pink: {
    card: "bg-pink-50 border-pink-100 dark:bg-pink-500/10 dark:border-pink-500/20",
    icon: "text-pink-600 bg-white/80 dark:bg-pink-500/15 dark:text-pink-300",
  },
};

type Rule = { match: RegExp; tone: string; icon?: LucideIcon; glyph?: string };

// First match wins; matched against "<name> <code>" in lower case.
const RULES: Rule[] = [
  { match: /english|\beng\b/, tone: "rose", icon: BookOpen },
  { match: /math/, tone: "sky", icon: Calculator },
  { match: /\bevs\b|environment/, tone: "emerald", icon: Leaf },
  { match: /hindi|sanskrit/, tone: "amber", glyph: "अ" },
  { match: /telugu/, tone: "amber", glyph: "అ" },
  { match: /tamil/, tone: "amber", glyph: "அ" },
  { match: /kannada/, tone: "amber", glyph: "ಅ" },
  { match: /computer|\bict\b|coding/, tone: "violet", icon: Monitor },
  { match: /\bart|drawing|craft/, tone: "fuchsia", icon: Palette },
  { match: /physical|\bpe\b|sport|games/, tone: "emerald", icon: Activity },
  { match: /music|dance/, tone: "pink", icon: Music },
  { match: /library|reading/, tone: "indigo", icon: Library },
  { match: /value|moral/, tone: "teal", icon: Heart },
  { match: /life skill/, tone: "rose", icon: Lightbulb },
  { match: /science|physics|chemistry|biology/, tone: "teal", icon: FlaskConical },
  { match: /social|history|civics/, tone: "orange", icon: Landmark },
  { match: /geograph/, tone: "sky", icon: Globe },
  { match: /activity|club/, tone: "rose", icon: Star },
];

const FALLBACK_TONES = Object.keys(TONES);

export type SubjectStyle = { tone: Tone; icon?: LucideIcon; glyph?: string };

export function subjectStyle(name: string, code = ""): SubjectStyle {
  const key = `${name} ${code}`.toLowerCase();
  const rule = RULES.find((r) => r.match.test(key));
  if (rule) return { tone: TONES[rule.tone], icon: rule.icon, glyph: rule.glyph };
  // Stable colour per unknown subject.
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { tone: TONES[FALLBACK_TONES[h % FALLBACK_TONES.length]], icon: BookOpen };
}

export function SubjectIcon({
  name,
  code,
  className = "h-8 w-8",
}: {
  name: string;
  code?: string;
  className?: string;
}) {
  const s = subjectStyle(name, code);
  const Icon = s.icon;
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg ${s.tone.icon} ${className}`}
    >
      {s.glyph ? (
        <span className="text-base font-bold leading-none">{s.glyph}</span>
      ) : Icon ? (
        <Icon className="h-4 w-4" />
      ) : null}
    </span>
  );
}
