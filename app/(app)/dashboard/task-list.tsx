"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PriorityValue = "HIGH" | "MEDIUM" | "LOW";
type CategoryValue = "IMPORTANT" | "THIS_WEEK" | "PARKING" | "IDEA";
type StatusValue = "TODO" | "DONE" | "ARCHIVED";

interface TaskItem {
  id: string;
  title: string;
  due_date: string | null;
  due_time: string | null;
  priority: PriorityValue | null;
  category: CategoryValue | null;
  estimated_duration_minutes: number | null;
  status: StatusValue;
}

interface TaskListProps {
  refreshKey?: number;
}

const PRIORITY_LABELS: Record<PriorityValue, string> = {
  HIGH: "Haute",
  MEDIUM: "Moyenne",
  LOW: "Basse",
};

const CATEGORY_LABELS: Record<CategoryValue, string> = {
  IMPORTANT: "Important",
  THIS_WEEK: "Cette semaine",
  PARKING: "Parking",
  IDEA: "Idée",
};

const STATUS_LABELS: Record<StatusValue, string> = {
  TODO: "À faire",
  DONE: "Terminée",
  ARCHIVED: "Archivée",
};

const MONTH_NAMES_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

function isPriorityValue(value: unknown): value is PriorityValue {
  return value === "HIGH" || value === "MEDIUM" || value === "LOW";
}

function isCategoryValue(value: unknown): value is CategoryValue {
  return value === "IMPORTANT" || value === "THIS_WEEK" || value === "PARKING" || value === "IDEA";
}

function isStatusValue(value: unknown): value is StatusValue {
  return value === "TODO" || value === "DONE" || value === "ARCHIVED";
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
  if (v.estimated_duration_minutes !== null && typeof v.estimated_duration_minutes !== "number") return false;
  if (!isStatusValue(v.status)) return false;
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

/**
 * Formate une date "YYYY-MM-DD" en date FR lisible sans passer par `new Date()`,
 * pour éviter tout décalage lié à la timezone du navigateur. Le projet utilise
 * une timezone fixe MVP (Africa/Lome) côté backend ; on affiche donc la date
 * métier reçue telle quelle, sans réinterprétation.
 */
function formatDueDate(dueDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!match) return dueDate;
  const [, year, month, day] = match;
  const monthName = MONTH_NAMES_FR[Number(month) - 1];
  return monthName ? `${Number(day)} ${monthName} ${year}` : dueDate;
}

export default function TaskList({ refreshKey = 0 }: TaskListProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      {tasks !== null && !error && tasks.length > 0 && (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="border border-gray-200 rounded-md p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <div>
                <p className="font-medium text-gray-900">{task.title}</p>

                {(task.due_date || task.due_time) && (
                  <p className="text-sm text-gray-600 mt-1">
                    📅 {task.due_date ? formatDueDate(task.due_date) : ""}
                    {task.due_date && task.due_time ? " · " : ""}
                    {task.due_time ?? ""}
                  </p>
                )}

                <p className="text-sm text-gray-600 mt-1">
                  Priorité : {task.priority ? PRIORITY_LABELS[task.priority] : "—"}
                  {" · "}
                  {task.category ? CATEGORY_LABELS[task.category] : "—"}
                </p>

                {task.estimated_duration_minutes !== null && (
                  <p className="text-sm text-gray-600 mt-1">⏱ {task.estimated_duration_minutes} min</p>
                )}
              </div>

              <span className="self-start sm:self-center inline-block px-3 py-1 text-sm font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {STATUS_LABELS[task.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
