"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSpeechRecognition } from "./use-speech-recognition";
import TaskProposalForm, {
  type CaptureProposal,
  type CategoryValue,
  type PriorityValue,
} from "./task-proposal-form";

const MIN_TEXT_LENGTH = 1;
const MAX_TEXT_LENGTH = 1000;

const PRIORITY_VALUES: readonly string[] = ["HIGH", "MEDIUM", "LOW"];
const CATEGORY_VALUES: readonly string[] = ["IMPORTANT", "THIS_WEEK", "PARKING", "IDEA"];

function isPriorityValue(value: unknown): value is PriorityValue {
  return typeof value === "string" && PRIORITY_VALUES.includes(value);
}

function isCategoryValue(value: unknown): value is CategoryValue {
  return typeof value === "string" && CATEGORY_VALUES.includes(value);
}

interface CaptureApiSuccess {
  success: true;
  ai_failed: boolean;
  message?: string;
  propositions: {
    title: string;
    due_date: string | null;
    due_time: string | null;
    priority_ia_proposed: PriorityValue;
    category_ia_proposed: CategoryValue;
    estimated_duration_minutes: number | null;
  };
}

/**
 * Vérification défensive de la réponse de POST /api/tasks/capture avant de
 * l'utiliser : on ne fait confiance qu'à une forme exploitable et complète.
 */
function isCaptureApiSuccess(value: unknown): value is CaptureApiSuccess {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.success !== true) return false;
  if (typeof v.ai_failed !== "boolean") return false;
  if (typeof v.propositions !== "object" || v.propositions === null) return false;

  const p = v.propositions as Record<string, unknown>;
  if (typeof p.title !== "string") return false;
  if (p.due_date !== null && typeof p.due_date !== "string") return false;
  if (p.due_time !== null && typeof p.due_time !== "string") return false;
  if (!isPriorityValue(p.priority_ia_proposed)) return false;
  if (!isCategoryValue(p.category_ia_proposed)) return false;
  if (p.estimated_duration_minutes !== null && typeof p.estimated_duration_minutes !== "number") return false;

  return true;
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

interface TaskCaptureProps {
  onTaskCreated?: () => void;
}

export default function TaskCapture({ onTaskCreated }: TaskCaptureProps = {}) {
  const router = useRouter();
  const [captureText, setCaptureText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<CaptureProposal | null>(null);

  const speech = useSpeechRecognition({
    onTranscript: (transcript) => {
      // Le texte transcrit remplace le contenu du champ ; l'utilisateur peut
      // le corriger avant de cliquer sur Analyser (jamais déclenché ici).
      setCaptureText(transcript);
    },
  });

  const handleAnalyze = async () => {
    if (isAnalyzing) return;

    if (captureText.length < MIN_TEXT_LENGTH || captureText.length > MAX_TEXT_LENGTH) {
      setError(`Le texte doit contenir entre ${MIN_TEXT_LENGTH} et ${MAX_TEXT_LENGTH} caractères.`);
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const res = await fetch("/api/tasks/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: captureText }),
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
        setError(extractMessage(json, "Le texte saisi est invalide."));
        return;
      }

      if (!res.ok || !isCaptureApiSuccess(json)) {
        setError("Une erreur est survenue. Réessaie.");
        return;
      }

      const p = json.propositions;
      setProposal({
        title: p.title,
        due_date: p.due_date,
        due_time: p.due_time,
        priority: p.priority_ia_proposed,
        category: p.category_ia_proposed,
        estimated_duration_minutes: p.estimated_duration_minutes,
        priority_ia_proposed: p.priority_ia_proposed,
        category_ia_proposed: p.category_ia_proposed,
        ai_extracted: !json.ai_failed,
        source_text: captureText,
        aiFailed: json.ai_failed,
        aiMessage: json.message,
      });
    } catch {
      setError("Une erreur est survenue. Réessaie.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleBackToText = (sourceText: string) => {
    setProposal(null);
    setCaptureText(sourceText);
    setError(null);
  };

  const handleCreated = () => {
    setProposal(null);
    setCaptureText("");
    setError(null);
    onTaskCreated?.();
  };

  if (proposal) {
    return <TaskProposalForm proposal={proposal} onBackToText={handleBackToText} onCreated={handleCreated} />;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
      <label htmlFor="capture-text" className="block text-lg font-semibold text-gray-900 mb-2">
        Que dois-tu faire ?
      </label>

      <textarea
        id="capture-text"
        value={captureText}
        onChange={(e) => setCaptureText(e.target.value)}
        maxLength={MAX_TEXT_LENGTH}
        rows={4}
        disabled={isAnalyzing}
        placeholder="Ex. Je dois envoyer le rapport vendredi à 15h"
        className="w-full resize-none rounded-md border border-gray-300 p-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      />

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
      )}

      {speech.status === "error" && speech.errorMessage && (
        <div className="mt-3 text-sm text-red-600" role="alert">
          {speech.errorMessage}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
        {speech.supported ? (
          <button
            type="button"
            onClick={speech.status === "listening" ? speech.stop : speech.start}
            disabled={isAnalyzing}
            aria-label={speech.status === "listening" ? "Arrêter l'écoute" : "Démarrer la saisie vocale"}
            aria-pressed={speech.status === "listening"}
            className={`px-4 py-2 rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              speech.status === "listening"
                ? "border-red-300 bg-red-50 text-red-700"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {speech.status === "listening" ? "🔴 Écoute en cours..." : "🎙️"}
          </button>
        ) : (
          <span className="text-sm text-gray-500">Saisie vocale non disponible sur ce navigateur.</span>
        )}

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isAnalyzing || captureText.length < MIN_TEXT_LENGTH}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isAnalyzing ? "Analyse en cours..." : "Analyser"}
        </button>
      </div>
    </div>
  );
}
