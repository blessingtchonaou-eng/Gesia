"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "DO_TODAY" | "POSTPONE" | "ARCHIVE" | "DELETE";
type Mode = "choices" | "postpone" | "confirm-delete";

interface OverdueDecisionPanelProps {
  taskId: string;
  onActionDone: () => void;
}

const GENERIC_ERROR = "Impossible d'appliquer ce choix. Réessaie.";

function extractMessage(value: unknown, fallback: string): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as Record<string, unknown>).message === "string"
  ) {
    return (value as Record<string, unknown>).message as string;
  }
  return fallback;
}

function isSuccessResponse(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as Record<string, unknown>).success === true;
}

const choiceButtonClass =
  "px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

/**
 * Proposition de décision pour une tâche TODO arrivée à échéance. Affichée
 * uniquement par TaskList pour status === "TODO" && is_overdue ; le serveur
 * revérifie de toute façon l'éligibilité. Le panneau n'applique aucune règle
 * de date : il envoie le choix à POST /api/tasks/[id]/overdue-action.
 */
export default function OverdueDecisionPanel({ taskId, onActionDone }: OverdueDecisionPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choices");
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  const runAction = async (action: Action, extra?: { new_date: string; new_time: string | null }) => {
    if (pending) return;

    setPending(action);
    setError(null);

    try {
      const res = await fetch(`/api/tasks/${taskId}/overdue-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        setError(GENERIC_ERROR);
        return;
      }

      if (res.status === 409) {
        // La tâche a changé entre-temps : on rafraîchit la liste.
        setError("Cette tâche a changé entre-temps.");
        onActionDone();
        return;
      }

      if (res.status === 400) {
        setError(extractMessage(json, GENERIC_ERROR));
        return;
      }

      if (!res.ok || !isSuccessResponse(json)) {
        setError(GENERIC_ERROR);
        return;
      }

      onActionDone();
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setPending(null);
    }
  };

  const handlePostponeSubmit = () => {
    if (!newDate) {
      setError("Choisis une nouvelle date.");
      return;
    }
    runAction("POSTPONE", { new_date: newDate, new_time: newTime || null });
  };

  return (
    <div
      role="group"
      aria-label="Décision pour une tâche arrivée à échéance"
      className="w-full rounded-md bg-amber-50 border border-amber-200 p-3"
    >
      <p className="text-sm font-medium text-amber-900">Cette tâche est arrivée à échéance.</p>
      <p className="text-sm text-amber-800">Que veux-tu en faire ?</p>

      {mode === "choices" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runAction("DO_TODAY")}
            disabled={pending !== null}
            className={choiceButtonClass}
          >
            {pending === "DO_TODAY" ? "..." : "Faire aujourd'hui"}
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setMode("postpone");
            }}
            disabled={pending !== null}
            className={choiceButtonClass}
          >
            Reporter
          </button>
          <button
            type="button"
            onClick={() => runAction("ARCHIVE")}
            disabled={pending !== null}
            className={choiceButtonClass}
          >
            {pending === "ARCHIVE" ? "..." : "Archiver"}
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setMode("confirm-delete");
            }}
            disabled={pending !== null}
            className="px-3 py-1.5 text-sm font-medium rounded-md text-gray-500 hover:text-gray-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Supprimer
          </button>
        </div>
      )}

      {mode === "postpone" && (
        <div className="mt-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor={`postpone-date-${taskId}`} className="block text-xs font-medium text-gray-700">
                Nouvelle date
              </label>
              <input
                id={`postpone-date-${taskId}`}
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                disabled={pending !== null}
                className="mt-1 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor={`postpone-time-${taskId}`} className="block text-xs font-medium text-gray-700">
                Heure (facultatif)
              </label>
              <input
                id={`postpone-time-${taskId}`}
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                disabled={pending !== null}
                className="mt-1 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePostponeSubmit}
              disabled={pending !== null}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {pending === "POSTPONE" ? "..." : "Reporter"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode("choices");
              }}
              disabled={pending !== null}
              className={choiceButtonClass}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {mode === "confirm-delete" && (
        <div className="mt-3">
          <p className="text-sm text-gray-700">
            Supprimer définitivement cette tâche ? Cette action est irréversible.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => runAction("DELETE")}
              disabled={pending !== null}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-700 text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {pending === "DELETE" ? "..." : "Supprimer définitivement"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode("choices");
              }}
              disabled={pending !== null}
              className={choiceButtonClass}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-gray-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
