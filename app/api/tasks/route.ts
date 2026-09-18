import { createClient } from "../../../src/lib/supabase/server";
import { ensureUserExists } from "../../../src/lib/user-service";
import { prisma } from "../../../src/lib/prisma";
import { isTaskOverdue } from "../../../src/lib/task-date";

const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
const CATEGORIES = ["IMPORTANT", "THIS_WEEK", "PARKING", "IDEA"] as const;

// Plafond MVP pour une tâche unitaire (8h) : la décomposition de projets
// complexes en plusieurs blocs est explicitement hors périmètre du MVP.
const MAX_ESTIMATED_DURATION_MINUTES = 480;

type Priority = (typeof PRIORITIES)[number];
type Category = (typeof CATEGORIES)[number];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
}

function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

/**
 * Valide qu'une chaîne YYYY-MM-DD représente un jour calendaire réel
 * (rejette par exemple "2026-02-30" que Date accepterait silencieusement).
 */
function isValidCalendarDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

interface ValidatedTaskInput {
  title: string;
  due_date: string | null;
  due_time: string | null;
  priority: Priority | null;
  category: Category | null;
  estimated_duration_minutes: number | null;
  source_text: string;
  priority_ia_proposed: Priority;
  category_ia_proposed: Category;
  ai_extracted: boolean;
}

type ValidationResult =
  | { valid: true; data: ValidatedTaskInput }
  | { valid: false; message: string };

/**
 * Validation stricte du body de POST /api/tasks.
 * Les champs optionnels absents (undefined) sont traités comme null.
 */
function validateBody(body: Record<string, unknown>): ValidationResult {
  const title = body.title;
  if (typeof title !== "string" || title.length < 1 || title.length > 500) {
    return { valid: false, message: "title doit être une chaîne de 1 à 500 caractères" };
  }

  const source_text = body.source_text;
  if (typeof source_text !== "string" || source_text.length < 1 || source_text.length > 1000) {
    return { valid: false, message: "source_text doit être une chaîne de 1 à 1000 caractères" };
  }

  const priority = body.priority ?? null;
  if (priority !== null && !isPriority(priority)) {
    return { valid: false, message: "priority doit être HIGH, MEDIUM, LOW ou null" };
  }

  const category = body.category ?? null;
  if (category !== null && !isCategory(category)) {
    return { valid: false, message: "category doit être IMPORTANT, THIS_WEEK, PARKING, IDEA ou null" };
  }

  const priority_ia_proposed = body.priority_ia_proposed;
  if (!isPriority(priority_ia_proposed)) {
    return { valid: false, message: "priority_ia_proposed est requis et doit être HIGH, MEDIUM ou LOW" };
  }

  const category_ia_proposed = body.category_ia_proposed;
  if (!isCategory(category_ia_proposed)) {
    return { valid: false, message: "category_ia_proposed est requis et doit être IMPORTANT, THIS_WEEK, PARKING ou IDEA" };
  }

  const ai_extracted = body.ai_extracted;
  if (typeof ai_extracted !== "boolean") {
    return { valid: false, message: "ai_extracted doit être un booléen" };
  }

  const estimated_duration_minutes = body.estimated_duration_minutes ?? null;
  if (
    estimated_duration_minutes !== null &&
    (
      typeof estimated_duration_minutes !== "number" ||
      !Number.isInteger(estimated_duration_minutes) ||
      estimated_duration_minutes <= 0 ||
      estimated_duration_minutes > MAX_ESTIMATED_DURATION_MINUTES
    )
  ) {
    return {
      valid: false,
      message: `estimated_duration_minutes doit être un entier positif (max ${MAX_ESTIMATED_DURATION_MINUTES}) ou null`,
    };
  }

  const due_date = body.due_date ?? null;
  if (due_date !== null && (typeof due_date !== "string" || !isValidCalendarDate(due_date))) {
    return { valid: false, message: "due_date doit être une date valide au format YYYY-MM-DD ou null" };
  }

  const due_time = body.due_time ?? null;
  if (due_time !== null && (typeof due_time !== "string" || !TIME_REGEX.test(due_time))) {
    return { valid: false, message: "due_time doit être au format HH:MM (24h) ou null" };
  }

  return {
    valid: true,
    data: {
      title,
      due_date: due_date as string | null,
      due_time: due_time as string | null,
      priority: priority as Priority | null,
      category: category as Category | null,
      estimated_duration_minutes: estimated_duration_minutes as number | null,
      source_text,
      priority_ia_proposed,
      category_ia_proposed,
      ai_extracted,
    },
  };
}

/**
 * POST /api/tasks
 *
 * Création définitive d'une Task à partir des valeurs validées par l'utilisateur.
 * Conserve à la fois les valeurs finales (priority, category) et les propositions
 * IA d'origine (priority_ia_proposed, category_ia_proposed) pour préserver la
 * distinction entre ce que l'IA a proposé et ce que l'utilisateur a validé.
 * N'appelle jamais OpenAI.
 */
export async function POST(request: Request) {
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

    if (typeof rawBody !== "object" || rawBody === null) {
      return Response.json(
        { success: false, error: "INVALID_INPUT", message: "Données invalides" },
        { status: 400 }
      );
    }

    const validation = validateBody(rawBody as Record<string, unknown>);
    if (!validation.valid) {
      return Response.json(
        { success: false, error: "INVALID_INPUT", message: validation.message },
        { status: 400 }
      );
    }

    const data = validation.data;

    // 3. Synchronisation de l'utilisateur Gesia (seulement après validation)
    const gesiaUser = await ensureUserExists(user.id);

    // 4. Conversion déterministe de due_date.
    // Convention MVP identique à /api/tasks/capture : timezone fixe Africa/Lome
    // (UTC+0, sans heure d'été). Un jour "YYYY-MM-DD" est donc stocké comme minuit
    // UTC, ce qui correspond exactement à minuit à Lomé — aucune interprétation
    // ambiguë liée à la timezone de la machine serveur.
    const dueDateValue = data.due_date ? new Date(`${data.due_date}T00:00:00.000Z`) : null;

    // 5. Création de la tâche
    const task = await prisma.task.create({
      data: {
        user_id: gesiaUser.id,
        title: data.title,
        due_date: dueDateValue,
        due_time: data.due_time,
        priority: data.priority,
        priority_ia_proposed: data.priority_ia_proposed,
        category: data.category,
        category_ia_proposed: data.category_ia_proposed,
        estimated_duration_minutes: data.estimated_duration_minutes,
        source_text: data.source_text,
        ai_extracted: data.ai_extracted,
        status: "TODO",
      },
    });

    return Response.json(
      {
        success: true,
        task: {
          id: task.id,
          title: task.title,
          due_date: task.due_date ? task.due_date.toISOString().split("T")[0] : null,
          due_time: task.due_time,
          priority: task.priority,
          category: task.category,
          estimated_duration_minutes: task.estimated_duration_minutes,
          status: task.status,
          source_text: task.source_text,
          ai_extracted: task.ai_extracted,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur lors de la création de la tâche:", error);
    return Response.json(
      { success: false, error: "INTERNAL_ERROR", message: "Erreur interne" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tasks
 *
 * Récupère les tâches de l'utilisateur authentifié. Tri MVP simple :
 * échéance la plus proche en premier, tâches sans due_date ensuite, et à
 * égalité les plus récemment créées en premier. Pas de pagination, de
 * filtre ni de tri configurable à ce stade.
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

    // 2. Synchronisation de l'utilisateur Gesia — source du filtre, jamais le client
    const gesiaUser = await ensureUserExists(user.id);

    // 3. Sélection explicite des champs : ne jamais exposer user_id ou un
    // champ interne non prévu au contrat de sortie.
    const tasks = await prisma.task.findMany({
      where: { user_id: gesiaUser.id },
      orderBy: [{ due_date: { sort: "asc", nulls: "last" } }, { created_at: "desc" }],
      select: {
        id: true,
        title: true,
        due_date: true,
        due_time: true,
        priority: true,
        priority_ia_proposed: true,
        category: true,
        category_ia_proposed: true,
        estimated_duration_minutes: true,
        status: true,
        source_text: true,
        ai_extracted: true,
        created_at: true,
        updated_at: true,
      },
    });

    // is_overdue est calculé à la lecture (jamais stocké), avec un seul
    // "maintenant" pour toute la liste.
    const now = new Date();

    return Response.json(
      {
        success: true,
        tasks: tasks.map((task) => {
          const dueDate = task.due_date ? task.due_date.toISOString().split("T")[0] : null;

          return {
            ...task,
            due_date: dueDate,
            is_overdue: isTaskOverdue(
              { status: task.status, due_date: dueDate, due_time: task.due_time },
              now
            ),
          };
        }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erreur lors de la récupération des tâches:", error);
    return Response.json(
      { success: false, error: "INTERNAL_ERROR", message: "Erreur interne" },
      { status: 500 }
    );
  }
}
