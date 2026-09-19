"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS, type CategoryValue } from "./task-format";

export type PriorityValue = "HIGH" | "MEDIUM" | "LOW";
// Réexporté : task-capture.tsx importe ce type depuis ce module.
export type { CategoryValue };

export interface CaptureProposal {
  title: string;
  due_date: string | null;
  due_time: string | null;
  priority: PriorityValue;
  // Catégorie présélectionnée : null = « À classer plus tard » (aussi le cas
  // quand l'IA a échoué : le fallback technique n'est jamais présélectionné).
  category: CategoryValue | null;
  estimated_duration_minutes: number | null;
  priority_ia_proposed: PriorityValue;
  category_ia_proposed: CategoryValue;
  ai_extracted: boolean;
  source_text: string;
  aiFailed: boolean;
  aiMessage?: string;
}

interface TaskProposalFormProps {
  proposal: CaptureProposal;
  onBackToText: (sourceText: string) => void;
  onCreated: () => void;
}

const PRIORITY_LABELS: Record<PriorityValue, string> = {
  HIGH: "Haute",
  MEDIUM: "Moyenne",
  LOW: "Basse",
};

// Doit rester cohérent avec le plafond appliqué côté API (POST /api/tasks).
const MAX_ESTIMATED_DURATION_MINUTES = 480;

interface CreateTaskApiSuccess {
  success: true;
  task: { id: string };
}

function isCreateTaskApiSuccess(value: unknown): value is CreateTaskApiSuccess {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.success !== true) return false;
  if (typeof v.task !== "object" || v.task === null) return false;
  return typeof (v.task as Record<string, unknown>).id === "string";
}

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

export default function TaskProposalForm({ proposal, onBackToText, onCreated }: TaskProposalFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(proposal.title);
  const [dueDate, setDueDate] = useState(proposal.due_date ?? "");
  const [dueTime, setDueTime] = useState(proposal.due_time ?? "");
  const [priority, setPriority] = useState<PriorityValue>(proposal.priority);
  const [category, setCategory] = useState<CategoryValue | null>(proposal.category);
  const [estimatedDuration, setEstimatedDuration] = useState(
    proposal.estimated_duration_minutes !== null ? String(proposal.estimated_duration_minutes) : ""
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Garde synchrone : `isSubmitting` ne suffit pas si deux soumissions partent
  // avant le prochain rendu. Il ne sert qu'à l'affichage du bouton.
  const submitGuardRef = useRef(false);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const handleConfirm = async () => {
    if (submitGuardRef.current) return;

    if (title.trim().length < 1 || title.length > 500) {
      setError("Le titre doit contenir entre 1 et 500 caractères.");
      return;
    }

    const trimmedDuration = estimatedDuration.trim();
    let durationValue: number | null = null;
    if (trimmedDuration !== "") {
      const parsed = Number(trimmedDuration);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_ESTIMATED_DURATION_MINUTES) {
        setError(`La durée estimée doit être un entier positif (max ${MAX_ESTIMATED_DURATION_MINUTES} minutes).`);
        return;
      }
      durationValue = parsed;
    }

    // Posée avant tout `await` : aucune autre soumission ne peut s'intercaler.
    submitGuardRef.current = true;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          due_date: dueDate || null,
          due_time: dueTime || null,
          priority,
          category,
          estimated_duration_minutes: durationValue,
          source_text: proposal.source_text,
          priority_ia_proposed: proposal.priority_ia_proposed,
          category_ia_proposed: proposal.category_ia_proposed,
          ai_extracted: proposal.ai_extracted,
        }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        setError("Une erreur est survenue. Réessaie.");
        return;
      }

      if (res.status === 400) {
        setError(extractMessage(json, "Les données saisies sont invalides."));
        return;
      }

      // Vérification défensive : on ne réinitialise le formulaire que si la
      // création a réellement réussi (201 + forme de réponse exploitable).
      if (res.status !== 201 || !isCreateTaskApiSuccess(json)) {
        setError("Une erreur est survenue. Réessaie.");
        return;
      }

      setSuccessMessage("✓ Tâche créée");
      successTimeoutRef.current = setTimeout(() => {
        onCreated();
      }, 1200);
    } catch {
      setError("Une erreur est survenue. Réessaie.");
    } finally {
      submitGuardRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (successMessage) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6" role="status">
        <p className="text-green-700 font-medium text-lg">{successMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Voici ce que j&apos;ai compris</h2>

      {proposal.aiFailed && (
        <div className="mt-2 mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded text-sm">
          L&apos;IA n&apos;a pas pu analyser automatiquement cette tâche. Vous pouvez vérifier ou compléter les
          informations ci-dessous.
        </div>
      )}

      <div className="space-y-4 mt-4">
        <div>
          <label htmlFor="task-title" className="block text-sm font-medium text-gray-700">
            Titre
          </label>
          <input
            id="task-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={500}
            disabled={isSubmitting}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="task-due-date" className="block text-sm font-medium text-gray-700">
              Date
            </label>
            <input
              id="task-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={isSubmitting}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="task-due-time" className="block text-sm font-medium text-gray-700">
              Heure
            </label>
            <input
              id="task-due-time"
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              disabled={isSubmitting}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="task-priority" className="block text-sm font-medium text-gray-700">
              Priorité
            </label>
            <select
              id="task-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as PriorityValue)}
              disabled={isSubmitting}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(Object.keys(PRIORITY_LABELS) as PriorityValue[]).map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="task-category" className="block text-sm font-medium text-gray-700">
              Catégorie
            </label>
            {/* Réellement proposée par l'IA seulement : jamais pour le fallback technique. */}
            {proposal.ai_extracted && (
              <p className="text-xs text-gray-500">
                Suggestion IA : {CATEGORY_LABELS[proposal.category_ia_proposed]}
              </p>
            )}
            <select
              id="task-category"
              value={category ?? ""}
              onChange={(e) => setCategory(e.target.value === "" ? null : (e.target.value as CategoryValue))}
              disabled={isSubmitting}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">À classer plus tard</option>
              {(Object.keys(CATEGORY_LABELS) as CategoryValue[]).map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="task-duration" className="block text-sm font-medium text-gray-700">
            Durée estimée (minutes)
          </label>
          <input
            id="task-duration"
            type="number"
            min={1}
            max={MAX_ESTIMATED_DURATION_MINUTES}
            value={estimatedDuration}
            onChange={(e) => setEstimatedDuration(e.target.value)}
            disabled={isSubmitting}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
      )}

      <div className="mt-6 flex flex-wrap gap-3 justify-between">
        <button
          type="button"
          onClick={() => onBackToText(proposal.source_text)}
          disabled={isSubmitting}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Modifier le texte
        </button>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? "Création en cours..." : "Confirmer"}
        </button>
      </div>
    </div>
  );
}
