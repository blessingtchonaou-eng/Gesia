"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isStatusValue, type StatusValue } from "./task-format";

const COMPLETION_ERROR = "Impossible de terminer la tâche. Réessaie.";

/** Vérification défensive de la réponse de PATCH /api/tasks/[id]. */
function isPatchTaskResponse(value: unknown): value is { success: true; task: { status: StatusValue } } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.success !== true) return false;
  if (typeof v.task !== "object" || v.task === null) return false;
  return isStatusValue((v.task as Record<string, unknown>).status);
}

/**
 * Logique du bouton « Terminer », partagée par TaskList et NextTasks :
 * PATCH /api/tasks/[id] avec { status: "DONE" }, un seul appel à la fois,
 * 401 → /login, message d'erreur générique, `onCompleted` après succès.
 */
export function useCompleteTask(onCompleted?: () => void) {
  const router = useRouter();
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);

  const completeTask = async (id: string) => {
    if (completingId) return;

    setCompletingId(id);
    setCompletionError(null);

    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        setCompletionError(COMPLETION_ERROR);
        return;
      }

      if (!res.ok || !isPatchTaskResponse(json)) {
        setCompletionError(COMPLETION_ERROR);
        return;
      }

      onCompleted?.();
    } catch {
      setCompletionError(COMPLETION_ERROR);
    } finally {
      setCompletingId(null);
    }
  };

  return { completingId, completionError, completeTask };
}
