import { createClient } from "../../../../src/lib/supabase/server";

/**
 * POST /api/tasks/capture
 *
 * Extrait des informations d'un texte via l'IA et retourne des propositions.
 * Ne crée aucune Task. Ne synchronise pas l'utilisateur.
 *
 * Pour l'instant, OpenAI n'est pas intégré, donc cette route retourne
 * des fallbacks système temporairement marqués comme non issus de l'IA.
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

    // 5. Préparer l'appel futur au service IA
    // TODO: Intégrer OpenAI pour extraire réellement les informations
    // const extraction = await extractTaskFromText(text);

    // 6. Retourner des fallbacks système clairement marqués comme non issus de l'IA
    // Ces valeurs permettent au flux de continuer manuellement pendant l'intégration IA
    return Response.json(
      {
        success: true,
        ai_failed: true,
        message: "L'IA n'est pas encore intégrée.",
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
