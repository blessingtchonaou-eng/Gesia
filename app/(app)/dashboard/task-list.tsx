"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import OverdueDecisionPanel from "./overdue-decision-panel";
import { useCompleteTask } from "./use-complete-task";
import { useChangeCategory } from "./use-change-category";
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  formatDueDate,
  isStatusValue,
  type CategoryValue,
  type PriorityValue,
  type StatusValue,
} from "./task-format";

interface TaskItem {
  id: string;
  title: string;
  due_date: string | null;
  due_time: string | null;
  priority: PriorityValue | null;
  category: CategoryValue | null;
  // Proposition IA d'origine : ne sert qu'à afficher une suggestion, jamais de catégorie choisie.
  category_ia_proposed: CategoryValue;
  ai_extracted: boolean;
  estimated_duration_minutes: number | null;
  status: StatusValue;
  is_overdue: boolean;
}

type InboxSectionKey = CategoryValue | "UNCLASSIFIED";

// Ordre d'affichage de l'Inbox : « À classer » d'abord, puis les catégories
// dans l'ordre de CATEGORY_LABELS.
const INBOX_SECTIONS: { key: InboxSectionKey; label: string }[] = [
  { key: "UNCLASSIFIED", label: "À classer" },
  ...(Object.keys(CATEGORY_LABELS) as CategoryValue[]).map((key) => ({
    key,
    label: CATEGORY_LABELS[key],
  })),
];

/**
 * Répartit les tâches par section en conservant l'ordre reçu de
 * GET /api/tasks (aucun tri supplémentaire). category === null → « À classer ».
 */
function groupTasksBySection(tasks: TaskItem[]): Record<InboxSectionKey, TaskItem[]> {
  const groups: Record<InboxSectionKey, TaskItem[]> = {
    UNCLASSIFIED: [],
    IMPORTANT: [],
    THIS_WEEK: [],
    PARKING: [],
    IDEA: [],
  };
  for (const task of tasks) {
    groups[task.category ?? "UNCLASSIFIED"].push(task);
  }
  return groups;
}

interface TaskListProps {
  refreshKey?: number;
  onTaskUpdated?: () => void;
}

const STATUS_LABELS: Record<StatusValue, string> = {
  TODO: "À faire",
  DONE: "Terminée",
  ARCHIVED: "Archivée",
};

function isPriorityValue(value: unknown): value is PriorityValue {
  return value === "HIGH" || value === "MEDIUM" || value === "LOW";
}

function isCategoryValue(value: unknown): value is CategoryValue {
  return value === "IMPORTANT" || value === "THIS_WEEK" || value === "PARKING" || value === "IDEA";
}

function isTaskItem(value: unknown): value is TaskItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string") return false;
  if (typeof v.title !== "string") return false;
  if (v.due_date !== null && typeof v.due_date !== "string") return false;
  if (v.due_time !== null && typeof v.due_time !== "string") return false;
  if (v.priority !== null && !isPriorityValue(v.priority)) return false;
  if (v.category !== null && !isCategoryValue(v.category)) return false;
  if (!isCategoryValue(v.category_ia_proposed)) return false;
  if (typeof v.ai_extracted !== "boolean") return false;
  if (v.estimated_duration_minutes !== null && typeof v.estimated_duration_minutes !== "number") return false;
  if (!isStatusValue(v.status)) return false;
  if (typeof v.is_overdue !== "boolean") return false;
  return true;
}

/**
 * Vérification défensive de la réponse de GET /api/tasks avant de l'utiliser :
 * success === true, tasks est un tableau, et chaque élément a une forme exploitable.
 */
function isTasksResponse(value: unknown): value is { success: true; tasks: TaskItem[] } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.success !== true) return false;
  if (!Array.isArray(v.tasks)) return false;
  return v.tasks.every(isTaskItem);
}

export default function TaskList({ refreshKey = 0, onTaskUpdated }: TaskListProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { completingId, completionError, completeTask } = useCompleteTask(onTaskUpdated);
  const { changingId, categoryError, changeCategory } = useChangeCategory(onTaskUpdated);

  const loadTasks = useCallback(async () => {
    setError(null);
    setTasks(null);

    try {
      const res = await fetch("/api/tasks", { method: "GET" });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        setError("Impossible de charger les tâches. Réessaie.");
        return;
      }

      if (!res.ok || !isTasksResponse(json)) {
        setError("Impossible de charger les tâches. Réessaie.");
        return;
      }

      setTasks(json.tasks);
    } catch {
      setError("Impossible de charger les tâches. Réessaie.");
    }
  }, [router]);

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const groupedTasks = tasks ? groupTasksBySection(tasks) : null;

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Mes tâches</h2>

      {tasks === null && !error && (
        <p className="text-gray-500" role="status">
          Chargement des tâches...
        </p>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          <p>{error}</p>
          <button
            type="button"
            onClick={loadTasks}
            className="mt-2 text-sm font-medium text-red-700 underline hover:text-red-800"
          >
            Réessayer
          </button>
        </div>
      )}

      {tasks !== null && !error && tasks.length === 0 && (
        <div className="text-gray-600">
          <p>Aucune tâche pour le moment.</p>
          <p className="mt-1">Commence par dire à Gesia ce que tu dois faire.</p>
        </div>
      )}

      {completionError && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {completionError}
        </div>
      )}

      {categoryError && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded" role="alert">
          {categoryError}
        </div>
      )}

      {groupedTasks !== null && !error && tasks !== null && tasks.length > 0 && (
        <div className="space-y-6">
        {INBOX_SECTIONS.map((section) => {
          const sectionTasks = groupedTasks[section.key];

          return (
        <section key={section.key} aria-labelledby={`inbox-section-${section.key}`}>
          <h3 id={`inbox-section-${section.key}`} className="text-base font-semibold text-gray-800 mb-2">
            {section.label} ({sectionTasks.length})
          </h3>

          {sectionTasks.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune tâche</p>
          ) : (
        <ul className="space-y-3">
          {sectionTasks.map((task) => {
            const isDone = task.status === "DONE";

            return (
            <li key={task.id} className="border border-gray-200 rounded-md p-4 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className={isDone ? "font-medium text-gray-400 line-through" : "font-medium text-gray-900"}>
                  {isDone ? "✓ " : ""}
                  {task.title}
                </p>

                {(task.due_date || task.due_time) && (
                  <p className="text-sm text-gray-600 mt-1">
                    📅 {task.due_date ? formatDueDate(task.due_date) : ""}
                    {task.due_date && task.due_time ? " · " : ""}
                    {task.due_time ?? ""}
                    {task.is_overdue && (
                      <span className="ml-2 inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        Échéance dépassée
                      </span>
                    )}
                  </p>
                )}

                <p className="text-sm text-gray-600 mt-1">
                  Priorité : {task.priority ? PRIORITY_LABELS[task.priority] : "—"}
                  {task.category ? ` · ${CATEGORY_LABELS[task.category]}` : ""}
                </p>

                {task.category === null && task.ai_extracted && (
                  <p className="text-xs text-gray-500 mt-1">
                    Suggestion IA : {CATEGORY_LABELS[task.category_ia_proposed]}
                  </p>
                )}

                {task.estimated_duration_minutes !== null && (
                  <p className="text-sm text-gray-600 mt-1">⏱ {task.estimated_duration_minutes} min</p>
                )}

                {task.status === "TODO" && (
                  <div className="mt-2">
                    <label htmlFor={`category-${task.id}`} className="block text-xs font-medium text-gray-600">
                      Changer la catégorie
                    </label>
                    <select
                      id={`category-${task.id}`}
                      value={task.category ?? ""}
                      onChange={(e) => changeCategory(task.id, e.target.value as CategoryValue)}
                      disabled={changingId !== null}
                      className="mt-1 block w-full sm:w-auto max-w-full px-2 py-1 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {task.category === null && (
                        <option value="" disabled>
                          À classer
                        </option>
                      )}
                      {(Object.keys(CATEGORY_LABELS) as CategoryValue[]).map((value) => (
                        <option key={value} value={value}>
                          {CATEGORY_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center">
                <span
                  className={`inline-block px-3 py-1 text-sm font-medium rounded-full border ${
                    isDone
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}
                >
                  {STATUS_LABELS[task.status]}
                </span>

                {task.status === "TODO" && (
                  <button
                    type="button"
                    onClick={() => completeTask(task.id)}
                    disabled={completingId === task.id}
                    className="px-3 py-1 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {completingId === task.id ? "..." : "Terminer"}
                  </button>
                )}
              </div>
              </div>

              {task.status === "TODO" && task.is_overdue && (
                <OverdueDecisionPanel taskId={task.id} onActionDone={() => onTaskUpdated?.()} />
              )}
            </li>
            );
          })}
        </ul>
          )}
        </section>
          );
        })}
        </div>
      )}
    </div>
  );
}
