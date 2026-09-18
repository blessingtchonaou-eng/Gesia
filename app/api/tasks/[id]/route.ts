import { createClient } from "../../../../src/lib/supabase/server";
import { ensureUserExists } from "../../../../src/lib/user-service";
import { prisma } from "../../../../src/lib/prisma";

/**
 * PATCH /api/tasks/[id]
 *
 * Première version, volontairement limitée à une seule transition :
 * TODO → DONE. DONE → DONE est idempotent (200, aucun update). Toute
 * tâche dans un autre état (ex. ARCHIVED) est refusée (409). Aucune autre
 * transition n'est supportée à ce stade.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authentification — jamais de user_id fourni par le client
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json(
        { success: false, error: "UNAUTHORIZED", message: "Session requise" },
        { status: 401 }
      );
    }

    // 2. Parsing + validation stricte du body AVANT tout accès à la base
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json(
        { success: false, error: "INVALID_INPUT", message: "Corps de requête JSON invalide" },
        { status: 400 }
      );
    }

    if (
      typeof rawBody !== "object" ||
      rawBody === null ||
      (rawBody as Record<string, unknown>).status !== "DONE"
    ) {
      return Response.json(
        { success: false, error: "INVALID_INPUT", message: "Statut invalide" },
        { status: 400 }
      );
    }

    // 3. Synchronisation de l'utilisateur Gesia
    const gesiaUser = await ensureUserExists(user.id);

    // 4. Vérification d'appartenance : id ET user_id simultanément. Un id
    // inexistant ou appartenant à un autre utilisateur produit la même
    // réponse 404 — aucune fuite d'information sur l'existence de la tâche.
    const { id } = await params;

    const task = await prisma.task.findFirst({
      where: { id, user_id: gesiaUser.id },
    });

    if (!task) {
      return Response.json(
        { success: false, error: "NOT_FOUND", message: "Tâche introuvable" },
        { status: 404 }
      );
    }

    // 5. Règle métier : seule la transition TODO → DONE est supportée.
    if (task.status === "DONE") {
      // Idempotent : déjà DONE, aucun nouvel update déclenché.
      return Response.json(
        {
          success: true,
          task: {
            id: task.id,
            title: task.title,
            status: task.status,
            updated_at: task.updated_at,
          },
        },
        { status: 200 }
      );
    }

    if (task.status !== "TODO") {
      // ARCHIVED (ou tout futur statut) ne peut pas être terminé par cette API.
      return Response.json(
        {
          success: false,
          error: "INVALID_TRANSITION",
          message: "Cette tâche ne peut pas être terminée dans son état actuel",
        },
        { status: 409 }
      );
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { status: "DONE" },
    });

    return Response.json(
      {
        success: true,
        task: {
          id: updated.id,
          title: updated.title,
          status: updated.status,
          updated_at: updated.updated_at,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la tâche:", error);
    return Response.json(
      { success: false, error: "INTERNAL_ERROR", message: "Erreur interne" },
      { status: 500 }
    );
  }
}
