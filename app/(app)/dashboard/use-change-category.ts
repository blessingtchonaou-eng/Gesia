"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryValue } from "./task-format";

const CATEGORY_ERROR_GENERIC = "Impossible de changer la catégorie. Réessaie.";
const CATEGORY_ERROR_INVALID = "Catégorie invalide. Choisis l'une des catégories proposées.";
const CATEGORY_ERROR_NOT_FOUND = "Cette tâche est introuvable. Elle a peut-être été supprimée.";
const CATEGORY_ERROR_NOT_TODO = "La catégorie ne peut être changée que pour une tâche à faire.";

/** Vérification défensive de la réponse de PATCH /api/tasks/[id]/category. */
function isCategoryResponse(value: unknown): value is { success: true; task: { id: string } } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.success !== true) return false;
  if (typeof v.task !== "object" || v.task === null) return false;
  return typeof (v.task as Record<string, unknown>).id === "string";
}

/**
 * Logique du changement de catégorie d'une tâche TODO depuis l'Inbox :
 * PATCH /api/tasks/[id]/category avec { category }, un seul appel à la fois,
 * 401 → /login, message d'erreur adapté au statut (jamais le message brut du
 * serveur), `onChanged` après succès. Pour 404 et 409, l'affichage est
 * périmé (tâche supprimée, terminée ou archivée entre-temps) : on appelle
 * aussi `onChanged` pour resynchroniser la liste, l'erreur reste affichée.
 */
export function useChangeCategory(onChanged?: () => void) {
  const router = useRouter();
  const [changingId, setChangingId] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  // Garde synchrone : le state ne suffit pas si deux événements partent
  // avant le prochain rendu.
  const inFlightRef = useRef(false);

  const changeCategory = async (id: string, category: CategoryValue) => {
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setChangingId(id);
    setCategoryError(null);

    try {
      const res = await fetch(`/api/tasks/${id}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (res.status === 400) {
        setCategoryError(CATEGORY_ERROR_INVALID);
        return;
      }

      if (res.status === 404) {
        setCategoryError(CATEGORY_ERROR_NOT_FOUND);
        onChanged?.();
        return;
      }

      if (res.status === 409) {
        setCategoryError(CATEGORY_ERROR_NOT_TODO);
        onChanged?.();
        return;
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        setCategoryError(CATEGORY_ERROR_GENERIC);
        return;
      }

      if (!res.ok || !isCategoryResponse(json)) {
        setCategoryError(CATEGORY_ERROR_GENERIC);
        return;
      }

      onChanged?.();
    } catch {
      setCategoryError(CATEGORY_ERROR_GENERIC);
    } finally {
      inFlightRef.current = false;
      setChangingId(null);
    }
  };

  return { changingId, categoryError, changeCategory };
}
