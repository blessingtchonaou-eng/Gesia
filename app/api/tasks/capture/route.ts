import { createClient } from "../../../../src/lib/supabase/server";
import { ensureUserExists } from "../../../../src/lib/user-service";
import {
  AI_MODEL,
  extractTaskFromTextWithUsage,
  type AIUsage,
  type TaskExtraction,
} from "../../../../src/lib/ai-service";
import {
  describeAIError,
  finalizeAIUsage,
  reserveAIAction,
  type AIUsageResult,
} from "../../../../src/lib/ai-usage";

/**
 * Finalise le journal d'usage IA sans jamais faire échouer la requête : si la
 * mise à jour échoue, la réservation reste en place (elle compte toujours) et
 * seule une erreur serveur sûre est loguée.
 */
async function safeFinalizeAIUsage(logId: string, result: AIUsageResult): Promise<void> {
  try {
    await finalizeAIUsage(logId, result);
  } catch (error) {
    console.error(
      "Finalisation AIUsageLog échouée (réservation conservée):",
      error instanceof Error ? error.name : "erreur inconnue"
    );
  }
}

/**
 * POST /api/tasks/capture
 *
 * Extrait des informations d'un texte via l'IA et retourne des propositions.
 * Ne crée aucune Task. Chaque appel OpenAI est réservé AVANT l'appel dans
 * AIUsageLog (limite mensuelle du plan) et finalisé après.
 */
export async function POST(request: Request) {
  try {
    // 1. Récupérer l'utilisateur avec le client Supabase serveur
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    // 2. Refuser les requêtes non authentifiées
    if (authError || !user) {
      return Response.json(
        {
          success: false,
          error: "UNAUTHORIZED",
          message: "Session requise",
        },
        { status: 401 }
      );
    }

    // 3. Lire le JSON de la requête
    const body = await request.json();

    // 4. Valider le texte (aucun AIUsageLog n'est créé pour une entrée invalide)
    if (!body.text || typeof body.text !== "string") {
      return Response.json(
        {
          success: false,
          error: "INVALID_INPUT",
          message: "Texte requis",
        },
        { status: 400 }
      );
    }

    const text = body.text;

    if (text.length < 1 || text.length > 1000) {
      return Response.json(
        {
          success: false,
          error: "INVALID_INPUT",
          message: "Texte requis entre 1 et 1000 caractères",
        },
        { status: 400 }
      );
    }

    // 5. Construire le contexte temporel pour la résolution des dates relatives
    // Timezone fixe MVP (Africa/Lome, cohérent avec le persona togolais) : à remplacer
    // plus tard par une vraie source utilisateur/navigateur. On dérive currentDate et
    // currentTime explicitement dans cette timezone (via Intl.DateTimeFormat) pour éviter
    // toute dépendance silencieuse à la timezone de la machine serveur.
    const timezone = "Africa/Lome";
    const now = new Date();

    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const timeFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const context = {
      currentDate: dateFormatter.format(now),
      currentTime: timeFormatter.format(now),
      timezone,
    };

    // 6. Utilisateur Gesia interne (AIUsageLog.user_id référence User.id).
    // Un échec ici (comme à l'étape suivante) mène au 500 global, sans appel OpenAI.
    const gesiaUser = await ensureUserExists(user.id);

    // 7. Réserver atomiquement une action IA AVANT tout appel OpenAI
    const reservation = await reserveAIAction(gesiaUser.id, "CAPTURE", now);

    // 8. Limite mensuelle du plan atteinte : 429 Gesia, aucun appel OpenAI,
    // aucun fallback (distinct d'une panne ou d'un quota OpenAI)
    if (!reservation.allowed) {
      return Response.json(
        {
          success: false,
          error: "AI_USAGE_LIMIT_REACHED",
          message: "La limite d'utilisation IA de ton plan a été atteinte.",
          usage: {
            used: reservation.used,
            limit: reservation.limit,
          },
        },
        { status: 429 }
      );
    }

    // 9. Appeler le service IA. Un échec (timeout, erreur OpenAI, résultat invalide)
    // ne doit jamais faire échouer la requête HTTP : on bascule sur le fallback contractuel.
    let outcome:
      | { ok: true; extraction: TaskExtraction; usage: AIUsage | null }
      | { ok: false; errorCode: string };

    try {
      const { extraction, usage } = await extractTaskFromTextWithUsage(text, context);
      outcome = { ok: true, extraction, usage };
    } catch (aiError) {
      outcome = { ok: false, errorCode: describeAIError(aiError) };
    }

    // 10. Finaliser le journal (hors du try ci-dessus : un échec de journalisation
    // ne transforme jamais un succès IA en échec)
    await safeFinalizeAIUsage(
      reservation.logId,
      outcome.ok
        ? {
            success: true,
            model: AI_MODEL,
            tokensInput: outcome.usage?.input_tokens ?? null,
            tokensOutput: outcome.usage?.output_tokens ?? null,
          }
        : { success: false, model: AI_MODEL, errorCode: outcome.errorCode }
    );

    if (outcome.ok) {
      const { extraction } = outcome;

      return Response.json(
        {
          success: true,
          ai_failed: false,
          propositions: {
            title: extraction.title,
            due_date: extraction.due_date,
            due_time: extraction.due_time,
            priority_ia_proposed: extraction.priority,
            category_ia_proposed: extraction.category,
            estimated_duration_minutes: extraction.estimated_duration_minutes,
          },
        },
        { status: 200 }
      );
    }

    console.error("Extraction IA échouée:", outcome.errorCode);

    return Response.json(
      {
        success: true,
        ai_failed: true,
        message: "L'IA n'a pas pu extraire les informations",
        propositions: {
          title: text, // Fallback : texte original comme titre
          due_date: null,
          due_time: null,
          priority_ia_proposed: "MEDIUM", // Fallback système (non IA)
          category_ia_proposed: "THIS_WEEK", // Fallback système (non IA)
          estimated_duration_minutes: null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "Erreur lors de la capture:",
      error instanceof Error ? `${error.name}: ${error.message.slice(0, 300)}` : "erreur inconnue"
    );
    return Response.json(
      {
        success: false,
        error: "INTERNAL_ERROR",
        message: "Erreur lors de l'extraction",
      },
      { status: 500 }
    );
  }
}
