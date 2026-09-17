"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Types minimaux pour l'API Web Speech (SpeechRecognition / webkitSpeechRecognition),
 * absente de lib.dom par défaut (API non standardisée). On ne type que ce dont ce
 * hook a besoin, sans ajouter de package @types supplémentaire.
 */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  [index: number]: SpeechRecognitionAlternativeLike;
  length: number;
}

interface SpeechRecognitionResultListLike {
  [index: number]: SpeechRecognitionResultLike;
  length: number;
}

interface SpeechRecognitionEventLike {
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export type SpeechStatus = "idle" | "listening" | "error";

interface UseSpeechRecognitionOptions {
  onTranscript: (transcript: string) => void;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

function mapSpeechError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Accès au microphone refusé.";
    case "no-speech":
      return "Aucune parole détectée.";
    case "network":
      return "Erreur réseau pendant l'écoute.";
    default:
      return "La saisie vocale a échoué.";
  }
}

/**
 * Encapsule la reconnaissance vocale native du navigateur.
 * Langue fixe MVP : fr-FR (support multilingue à ajouter plus tard).
 * Une seule session à la fois : start() est un no-op si une session est déjà active.
 */
export function useSpeechRecognition({ onTranscript }: UseSpeechRecognitionOptions) {
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setSupported(!!getSpeechRecognitionConstructor());

    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    if (recognitionRef.current) {
      // Une session est déjà active : jamais deux sessions simultanées.
      return;
    }

    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript) {
        onTranscriptRef.current(transcript);
      }
    };

    recognition.onerror = (event) => {
      setErrorMessage(mapSpeechError(event.error));
      setStatus("error");
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setStatus((current) => (current === "error" ? current : "idle"));
    };

    recognitionRef.current = recognition;
    setErrorMessage(null);
    setStatus("listening");
    recognition.start();
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { status, supported, errorMessage, start, stop };
}
