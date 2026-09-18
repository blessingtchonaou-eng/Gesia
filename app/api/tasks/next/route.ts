import { createClient } from "../../../../src/lib/supabase/server";
import { ensureUserExists } from "../../../../src/lib/user-service";
import { prisma } from "../../../../src/lib/prisma";
import { selectNextTasks } from "../../../../src/lib/task-selection";

/**
 * GET /api/tasks/next
 *
 * « Que dois-je faire maintenant ? » : jusqu'à 3 tâches TODO recommandées
 * pour l'utilisateur authentifié. Sélection déterministe et explicable (voir
 * src/lib/task-selection.ts), sans IA. Aucun paramètre client n'est lu :
 * ni user_id, ni limite, ni query string.
 */
export async function GET() {
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

    // 2. Utilisateur Gesia interne : seule source du filtre
    const gesiaUser = await ensureUserExists(user.id);

    // 3. Uniquement les tâches TODO de cet utilisateur, champs explicites.
    // Le tri final est fait en mémoire par selectNextTasks.
    const rows = await prisma.task.findMany({
      where: { user_id: gesiaUser.id, status: "TODO" },
      select: {
        id: true,
        title: true,
        due_date: true,
        due_time: true,
        priority: true,
        category: true,
        estimated_duration_minutes: true,
        status: true,
        created_at: true,
      },
    });

    const candidates = rows.map((task) => ({
      ...task,
      due_date: task.due_date ? task.due_date.toISOString().split("T")[0] : null,
    }));

    const selected = selectNextTasks(candidates, new Date());

    return Response.json(
      {
        success: true,
        tasks: selected.map((task) => ({
          id: task.id,
          title: task.title,
          due_date: task.due_date,
          due_time: task.due_time,
          priority: task.priority,
          category: task.category,
          estimated_duration_minutes: task.estimated_duration_minutes,
          status: task.status,
          is_overdue: task.is_overdue,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erreur lors de la sélection des tâches recommandées:", error);
    return Response.json(
      { success: false, error: "INTERNAL_ERROR", message: "Erreur interne" },
      { status: 500 }
    );
  }
}
