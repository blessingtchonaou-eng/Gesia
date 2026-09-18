import { createClient } from "../../../../../src/lib/supabase/server";
import { ensureUserExists } from "../../../../../src/lib/user-service";
import { prisma } from "../../../../../src/lib/prisma";
import {
  checkNewDeadline,
  dueDateToStoredValue,
  getTodayInAppTimezone,
  isTaskOverdue,
  isValidCalendarDate,
  isValidTime,
} from "../../../../../src/lib/task-date";

const ACTIONS = ["DO_TODAY", "POSTPONE", "ARCHIVE", "DELETE"] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

type ParsedRequest =
  | { valid: true; action: Action; newDate: string | null; newTime: string | null }
  | { valid: false; message: string };

/**
 * Validation stricte du body, avant tout accès à la base. Pour POSTPONE, la
 * nouvelle échéance est vérifiée ici : elle ne doit jamais être
 * immédiatement dépassée.
 */
function parseRequest(raw: unknown, now: Date): ParsedRequest {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, message: "Données invalides" };
  }

  const body = raw as Record<string, unknown>;
  const action = body.action;

  if (!isAction(action)) {
    return { valid: false, message: "Action invalide" };
  }

  if (action !== "POSTPONE") {
    return { valid: true, action, newDate: null, newTime: null };
  }

  const newDate = body.new_date;
  if (!isValidCalendarDate(newDate)) {
    return { valid: false, message: "Choisis une nouvelle date valide." };
  }

  const newTime = body.new_time ?? null;
  if (newTime !== null && !isValidTime(newTime)) {
    return { valid: false, message: "L'heure doit être au format HH:MM." };
  }

  const check = checkNewDeadline(newDate, newTime, now);
  if (!check.ok) {
    return {
      valid: false,
      message:
        check.reason === "PAST_DATE"
          ? "Choisis une date à partir d'aujourd'hui."
          : "Pour aujourd'hui, choisis une heure à venir (ou aucune heure).",
    };
  }

  return { valid: true, action, newDate, newTime };
}

/**
 * POST /api/tasks/[id]/overdue-action
 *
 * Décision de l'utilisateur sur une tâche arrivée à échéance (anti-backlog) :
 * DO_TODAY, POSTPONE, ARCHIVE ou DELETE. Réservé aux tâches TODO dont
 * l'échéance est dépassée ; l'éligibilité est recalculée ici côté serveur,
 * jamais déduite du client.
 */
export async function POST(
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

    // 2. Parsing + validation stricte AVANT tout accès à la base
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json(
        { success: false, error: "INVALID_INPUT", message: "Corps de requête JSON invalide" },
        { status: 400 }
      );
    }

    // Un seul "maintenant" pour la validation et le contrôle d'éligibilité.
    const now = new Date();

    const parsed = parseRequest(rawBody, now);
    if (!parsed.valid) {
      return Response.json(
        { success: false, error: "INVALID_INPUT", message: parsed.message },
        { status: 400 }
      );
    }

    // 3. Utilisateur Gesia interne
    const gesiaUser = await ensureUserExists(user.id);

    // 4. Appartenance : id ET user_id. Inexistante ou à un autre utilisateur :
    // même 404, aucune fuite d'information.
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

    // 5. Éligibilité : TODO ET échéance dépassée, recalculée maintenant.
    const currentDueDate = task.due_date ? task.due_date.toISOString().split("T")[0] : null;
    const eligible =
      task.status === "TODO" &&
      isTaskOverdue({ status: task.status, due_date: currentDueDate, due_time: task.due_time }, now);

    if (!eligible) {
      return Response.json(
        {
          success: false,
          error: "INVALID_TRANSITION",
          message: "Cette tâche n'est pas arrivée à échéance ou n'est plus à faire",
        },
        { status: 409 }
      );
    }

    // 6. Mutation conditionnelle : id + user_id + status TODO dans le WHERE,
    // pour qu'un changement survenu entre-temps ne soit jamais écrasé.
    const where = { id: task.id, user_id: gesiaUser.id, status: "TODO" as const };
    let affected: number;

    switch (parsed.action) {
      case "DO_TODAY":
        // Sans heure, l'échéance est la fin de journée : jamais en retard
        // avant demain 00:00.
        ({ count: affected } = await prisma.task.updateMany({
          where,
          data: {
            due_date: dueDateToStoredValue(getTodayInAppTimezone(now)),
            due_time: null,
          },
        }));
        break;
      case "POSTPONE":
        ({ count: affected } = await prisma.task.updateMany({
          where,
          data: {
            due_date: dueDateToStoredValue(parsed.newDate as string),
            due_time: parsed.newTime,
          },
        }));
        break;
      case "ARCHIVE":
        ({ count: affected } = await prisma.task.updateMany({
          where,
          data: { status: "ARCHIVED" },
        }));
        break;
      case "DELETE":
        ({ count: affected } = await prisma.task.deleteMany({ where }));
        break;
    }

    if (affected === 0) {
      return Response.json(
        {
          success: false,
          error: "INVALID_TRANSITION",
          message: "Cette tâche n'est pas arrivée à échéance ou n'est plus à faire",
        },
        { status: 409 }
      );
    }

    if (parsed.action === "DELETE") {
      return Response.json(
        { success: true, action: "DELETE", task: null },
        { status: 200 }
      );
    }

    const updated = await prisma.task.findFirst({
      where: { id: task.id, user_id: gesiaUser.id },
    });

    if (!updated) {
      return Response.json(
        { success: false, error: "NOT_FOUND", message: "Tâche introuvable" },
        { status: 404 }
      );
    }

    const updatedDueDate = updated.due_date ? updated.due_date.toISOString().split("T")[0] : null;

    return Response.json(
      {
        success: true,
        action: parsed.action,
        task: {
          id: updated.id,
          title: updated.title,
          status: updated.status,
          due_date: updatedDueDate,
          due_time: updated.due_time,
          is_overdue: isTaskOverdue(
            { status: updated.status, due_date: updatedDueDate, due_time: updated.due_time },
            now
          ),
          updated_at: updated.updated_at,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erreur lors de l'action sur tâche en retard:", error);
    return Response.json(
      { success: false, error: "INTERNAL_ERROR", message: "Erreur interne" },
      { status: 500 }
    );
  }
}
