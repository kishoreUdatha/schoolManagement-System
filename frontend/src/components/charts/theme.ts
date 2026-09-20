"use client";

import { useEffect, useState } from "react";

/** The series palette.
 *
 *  Fixed hexes rather than the CSS tokens, because a chart colour means
 *  "this line, not that one" — it has to stay the same when the workspace
 *  tint changes, or a reader comparing two screenshots is comparing nothing.
 *  Ordered so the first three are distinguishable to the common forms of
 *  colour blindness; blue leads because it is the product's own colour.
 */
export const SERIES = [
  "#2454FF", // brand blue
  "#07845E", // green, the same one the Done badge uses
  "#8E5C05", // amber
  "#B82E45", // rose
  "#7C3AED", // violet
  "#0E7490", // teal
  "#C2410C", // orange
  "#4B5563", // slate, for "other"
];

/** Good, fair, poor — for bars where the colour carries the verdict. */
export const VERDICT = { good: "#07845E", fair: "#8E5C05", poor: "#B82E45" };

export interface ChartTheme {
  axis: string;
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipInk: string;
}

const LIGHT: ChartTheme = {
  axis: "#5C6B82",
  grid: "#DCE4EF",
  tooltipBg: "#FFFFFF",
  tooltipBorder: "#DCE4EF",
  tooltipInk: "#12233F",
};
const DARK: ChartTheme = {
  axis: "#8A96A8",
  grid: "#20304C",
  tooltipBg: "#101B2F",
  tooltipBorder: "#20304C",
  tooltipInk: "#E9EFF9",
};

/** Axis and grid colours that follow the theme toggle.
 *
 *  Recharts writes these onto SVG attributes, where `var(--token)` does not
 *  resolve, so they cannot simply be Tailwind classes — the class has to be
 *  read back as a concrete colour. Watching the `dark` class on <html> is
 *  what ThemeProvider already flips, so the chart turns with everything else.
 */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(LIGHT);

  useEffect(() => {
    const read = () =>
      setTheme(document.documentElement.classList.contains("dark") ? DARK : LIGHT);
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
