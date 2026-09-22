"use client";

import { useEffect, useState } from "react";
import { api, errorText } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { childPath } from "../home/parts";
import type { Homework, Submission } from "./types";

export const homeworkPath = (childId: number) => childPath(childId, "/homework");
export const submissionPath = (childId: number, homeworkId: number) => childPath(childId, `/homework/${homeworkId}/submission`);

export type Stage = "todo" | "submitted" | "reviewed" | "closed";

export function stageOf(hw: Homework, sub: Submission | null): Stage {
  if (sub) return sub.status === "submitted" ? "submitted" : "reviewed";
  return hw.is_closed ? "closed" : "todo";
}

/**
 * The child's homework with each assignment's submission (one GET per
 * assignment, as the old parent portal did: the API has no bulk call).
 * Use inside <ChildScoped> so a child switch starts from empty.
 */
export function useHomeworkWithSubmissions(childId: number) {
  const list = useApi<Homework[]>(homeworkPath(childId));
  const [subs, setSubs] = useState<Map<number, Submission | null> | null>(null);
  const [subError, setSubError] = useState<string | null>(null);
  const ids = (list.data ?? []).map((h) => h.id).join(",");

  useEffect(() => {
    if (!list.data) return;
    let live = true;
    Promise.all(list.data.map((h) => api.get<Submission | null>(submissionPath(childId, h.id)).then((s) => [h.id, s] as const)))
      .then((pairs) => live && setSubs(new Map(pairs)))
      .catch((e) => live && setSubError(errorText(e)));
    return () => {
      live = false;
    };
    // ids captures the list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, ids]);

  const items = list.data && subs ? list.data.map((hw) => ({ hw, sub: subs.get(hw.id) ?? null })) : null;
  return { items, error: list.error ?? subError, loading: !items && !list.error && !subError };
}

/** One assignment (?id=) from the child's list, with its submission. */
export function useOneHomework(childId: number, homeworkId: number) {
  const list = useApi<Homework[]>(homeworkPath(childId));
  const sub = useApi<Submission | null>(homeworkId ? submissionPath(childId, homeworkId) : null);
  const hw = list.data?.find((h) => h.id === homeworkId) ?? null;
  return {
    hw,
    sub: sub.data,
    missing: Boolean(list.data) && !hw,
    ready: Boolean(list.data) && !sub.loading,
    error: list.error ?? (hw ? sub.error : null),
    reload: sub.reload,
  };
}
