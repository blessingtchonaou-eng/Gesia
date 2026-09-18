"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getTodayInAppTimezone } from "../../../src/lib/task-date";
import { useCompleteTask } from "./use-complete-task";
import { PRIORITY_LABELS, formatDeadline, type PriorityValue } from "./task-format";

interface NextTask {
  id: string;
  title: string;
  due_date: string | null;
  due_time: string | null;
  priority: PriorityValue | null;
  estimated_duration_minutes: number | null;
  is_overdue: boolean;
}

interface NextTasksProps {
  refreshKey?: number;
  onTaskUpdated?: () => void;
}

const LOAD_ERROR = "Impossible de charger tes recommandations. Réessaie.";

function isPriorityValue(value: unknown): value is PriorityValue {
  return value === "HIGH" || value === "MEDIUM" || value === "LOW";
}

function isNextTask(value: unknown): value is NextTask {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string") return false;
  if (typeof v.title !== "string") return false;
  if (v.due_date !== null && typeof v.due_date !== "string") return false;
  if (v.due_time !== null && typeof v.due_time !== "string") return false;
  if (v.priority !== null && !isPriorityValue(v.priority)) return false;
  if (v.estimated_duration_minutes !== null && typeof v.estimated_duration_minutes !== "number") return false;
  if (typeof v.is_overdue !== "boolean") return false;
  return true;
}

/** Vérification défensive de la réponse de GET /api/tasks/next. */
function isNextTasksResponse(value: unknown): value is { success: true; tasks: NextTask[] } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.success !== true) return false;
  if (!Array.isArray(v.tasks)) return false;
  return v.tasks.every(isNextTask);
}

/**
 * « Que dois-tu faire maintenant ? » : affiche, dans l'ordre exact reçu, les
 * recommandations de GET /api/tasks/next. Le backend est la seule source de
 * vérité : aucun tri, filtre, score ni détection de retard côté client.
 */
export default function NextTasks({ refreshKey = 0, onTaskUpdated }: NextTasksProps) {
  const router = useRouter();
  // null = premier chargement (ou rechargement après erreur) ; sinon les
  // recommandations restent affichées pendant un refetch (pas de clignotement).
  const [tasks, setTasks] = useState<NextTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Date du jour (Lomé), uniquement pour les libellés « Aujourd'hui / Demain ».
  const [today, setToday] = useState("");
  const { completingId, completionError, completeTask } = useCompleteTask(onTaskUpdated);

  // Identifie la requête la plus récente : une réponse périmée est ignorée.
  const requestIdRef = useRef(0);

  const loadTasks = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isStale = () => requestId !== requestIdRef.current;

    try {
      const res = await fetch("/api/tasks/next");

      if (isStale()) return;

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        if (!isStale()) {
          setTasks(null);
          setError(LOAD_ERROR);
        }
        return;
      }

      if (isStale()) return;

      if (!res.ok || !isNextTasksResponse(json)) {
        setTasks(null);
        setError(LOAD_ERROR);
        return;
      }

      setToday(getTodayInAppTimezone());
      setError(null);
      setTasks(json.tasks);
    } catch {
      if (!isStale()) {
        setTasks(null);
        setError(LOAD_ERROR);
      }
    }
  }, [router]);

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleRetry = () => {
    setError(null);
    loadTasks();
  };

  return (
    <section
      aria-labelledby="next-tasks-title"
      className="bg-white rounded-lg shadow-md p-4 sm:p-6 border-t-4 border-blue-600"
    >
      <h2 id="next-tasks-title" className="text-xl font-semibold text-gray-900">
        Que dois-tu faire maintenant ?
      </h2>

      {tasks === null && !error && (
        <p className="mt-3 text-gray-500" role="status">
          Chargement de tes recommandations...
        </p>
      )}

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          <p>{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-2 text-sm font-medium text-red-700 underline hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
          >
            Réessayer
          </button>
        </div>
      )}

      {tasks !== null && !error && tasks.length === 0 && (
        <div className="mt-3 text-gray-600">
          <p className="font-medium text-gray-800">Tout est calme pour le moment.</p>
          <p className="mt-1">Aucune tâche ne nécessite particulièrement ton attention.</p>
        </div>
      )}

      {completionError && (
        <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {completionError}
        </div>
      )}

      {tasks !== null && !error && tasks.length > 0 && (
        <>
          <p className="mt-1 text-sm text-gray-600">Voici les tâches les plus pertinentes.</p>

          <ol className="mt-4 space-y-3">
            {tasks.map((task, index) => (
              <li
                key={task.id}
                className={`rounded-md border p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                  task.is_overdue ? "border-amber-300 border-l-4 bg-amber-50/40" : "border-gray-200"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-base sm:text-lg font-semibold text-gray-900 break-words">
                    <span aria-hidden="true" className="mr-2 text-gray-400">
                      {index + 1}.
                    </span>
                    {task.title}
                  </p>

                  <p className="mt-1 text-sm text-gray-600">
                    {formatDeadline(task.due_date, task.due_time, today)}
                    {task.is_overdue && (
                      <span className="ml-2 inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                        Échéance dépassée
                      </span>
                    )}
                  </p>

                  {(task.priority !== null || task.estimated_duration_minutes !== null) && (
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                      {task.priority !== null && (
                        <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                          {PRIORITY_LABELS[task.priority]}
                        </span>
                      )}
                      {task.estimated_duration_minutes !== null && (
                        <span>{task.estimated_duration_minutes} min</span>
                      )}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => completeTask(task.id)}
                  disabled={completingId === task.id}
                  aria-label={`Terminer la tâche : ${task.title}`}
                  className="self-start sm:self-center px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {completingId === task.id ? "..." : "Terminer"}
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
