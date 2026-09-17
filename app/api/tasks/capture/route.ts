import { createClient } from "../../../../src/lib/supabase/server";
import { extractTaskFromText } from "../../../../src/lib/ai-service";

/**
 * POST /api/tasks/capture
 *
 * Extrait des informations d'un texte via l'IA et retourne des propositions.
 * Ne crée aucune Task. Ne synchronise pas l'utilisateur.
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

    // 4. Valider le texte
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

    // 6. Appeler le service IA. Un échec (timeout, erreur OpenAI, résultat invalide)
    // ne doit jamais faire échouer la requête HTTP : on bascule sur le fallback contractuel.
    try {
      const extraction = await extractTaskFromText(text, context);

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
    } catch (aiError) {
      console.error(
        "Extraction IA échouée:",
        aiError instanceof Error ? aiError.message : "Erreur inconnue"
      );

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
    }
  } catch (error) {
    console.error("Erreur lors de la capture:", error);
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
