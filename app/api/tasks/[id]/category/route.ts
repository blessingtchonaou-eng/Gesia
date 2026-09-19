import { createClient } from "../../../../../src/lib/supabase/server";
import { ensureUserExists } from "../../../../../src/lib/user-service";
import { prisma } from "../../../../../src/lib/prisma";

const CATEGORIES = ["IMPORTANT", "THIS_WEEK", "PARKING", "IDEA"] as const;
type Category = (typeof CATEGORIES)[number];

function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

/**
 * PATCH /api/tasks/[id]/category
 *
 * Change la catégorie choisie (`category`) d'une tâche TODO. Ne touche jamais
 * `category_ia_proposed` : la proposition IA reste la trace de l'origine.
 * Ne « désclasse » pas (category = null n'est pas accepté ici). N'appelle
 * jamais OpenAI et ne crée aucun AIUsageLog.
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

    // 2. Parsing + validation stricte du body AVANT tout accès à la base.
    // Le body doit contenir exactement une clé : `category`.
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
      Array.isArray(rawBody) ||
      Object.keys(rawBody).length !== 1 ||
      !isCategory((rawBody as Record<string, unknown>).category)
    ) {
      return Response.json(
        {
          success: false,
          error: "INVALID_INPUT",
          message: "category doit être IMPORTANT, THIS_WEEK, PARKING ou IDEA",
        },
        { status: 400 }
      );
    }

    const newCategory = (rawBody as { category: Category }).category;

    // 3. Utilisateur Gesia interne
    const gesiaUser = await ensureUserExists(user.id);

    // 4. Appartenance : id ET user_id. Inexistante ou à un autre utilisateur :
    // même 404, aucune fuite d'information.
    const { id } = await params;

    const task = await prisma.task.findFirst({
      where: { id, user_id: gesiaUser.id },
      select: { id: true, status: true, category: true, updated_at: true },
    });

    if (!task) {
      return Response.json(
        { success: false, error: "NOT_FOUND", message: "Tâche introuvable" },
        { status: 404 }
      );
    }

    // 5. Règle métier : la catégorie ne se change que sur une tâche TODO.
    if (task.status !== "TODO") {
      return Response.json(
        {
          success: false,
          error: "INVALID_STATUS",
          message: "La catégorie ne peut être modifiée que pour une tâche à faire",
        },
        { status: 409 }
      );
    }

    // 6. Idempotence : déjà dans cette catégorie, aucun update (updated_at intact).
    if (task.category === newCategory) {
      return Response.json(
        {
          success: true,
          task: { id: task.id, category: task.category, updated_at: task.updated_at },
        },
        { status: 200 }
      );
    }

    // 7. Mutation conditionnelle : le statut TODO est revérifié dans le WHERE
    // pour ne jamais écraser un changement survenu entre la lecture et l'écriture.
    // Seul `category` est écrit (updated_at est géré par Prisma).
    const { count } = await prisma.task.updateMany({
      where: { id: task.id, user_id: gesiaUser.id, status: "TODO" },
      data: { category: newCategory },
    });

    if (count === 0) {
      // La tâche a changé (ou disparu) entre-temps.
      const current = await prisma.task.findFirst({
        where: { id: task.id, user_id: gesiaUser.id },
        select: { id: true },
      });

      if (!current) {
        return Response.json(
          { success: false, error: "NOT_FOUND", message: "Tâche introuvable" },
          { status: 404 }
        );
      }

      return Response.json(
        {
          success: false,
          error: "INVALID_STATUS",
          message: "La catégorie ne peut être modifiée que pour une tâche à faire",
        },
        { status: 409 }
      );
    }

    const updated = await prisma.task.findFirst({
      where: { id: task.id, user_id: gesiaUser.id },
      select: { id: true, category: true, updated_at: true },
    });

    if (!updated) {
      return Response.json(
        { success: false, error: "NOT_FOUND", message: "Tâche introuvable" },
        { status: 404 }
      );
    }

    return Response.json(
      {
        success: true,
        task: { id: updated.id, category: updated.category, updated_at: updated.updated_at },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erreur lors du changement de catégorie de la tâche:", error);
    return Response.json(
      { success: false, error: "INTERNAL_ERROR", message: "Erreur interne" },
      { status: 500 }
    );
  }
}
