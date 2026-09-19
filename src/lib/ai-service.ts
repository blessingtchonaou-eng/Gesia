import OpenAI from "openai";
import { z } from "zod/v4";
import { zodTextFormat } from "openai/helpers/zod";

/**
 * Service d'extraction de tâches via OpenAI GPT-4o-mini
 * Utilise Responses API avec Structured Outputs pour garantir un format JSON précis
 */

/**
 * Modèle OpenAI utilisé pour l'extraction : source unique pour l'appel et
 * pour la journalisation (AIUsageLog.model_used).
 */
export const AI_MODEL = "gpt-4o-mini";

// Configuration du client OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 10000, // 10 secondes
  maxRetries: 1, // 1 retry en cas d'erreur transitoire
});

/**
 * Schéma Zod pour l'extraction de tâches
 * Définit la structure attendue de la réponse OpenAI
 */
const TaskExtractionSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(500)
    .describe("Titre de la tâche extrait du texte"),
  due_date: z
    .string()
    .nullable()
    .describe("Date d'échéance en format ISO 8601 (YYYY-MM-DD), ou null si absente"),
  due_time: z
    .string()
    .nullable()
    .describe("Heure d'échéance en format HH:MM (24h), ou null si absente"),
  priority: z
    .enum(["HIGH", "MEDIUM", "LOW"])
    .describe("Priorité estimée de la tâche (HIGH si urgent, MEDIUM si normal, LOW si optionnel)"),
  category: z
    .enum(["IMPORTANT", "THIS_WEEK", "PARKING", "IDEA"])
    .describe("Catégorie estimée de la tâche (IMPORTANT si critique, THIS_WEEK si cette semaine, PARKING si reportable, IDEA si une idée)"),
  estimated_duration_minutes: z
    .number()
    .nullable()
    .describe("Durée estimée en minutes, ou null si non inférable du contexte"),
});

/**
 * Type TypeScript dérivé du schéma Zod
 */
export type TaskExtraction = z.infer<typeof TaskExtractionSchema>;

/**
 * Contexte temporel pour la résolution des dates relatives
 */
export interface ExtractionContext {
  currentDate: string; // Format ISO 8601 YYYY-MM-DD
  currentTime: string; // Format HH:MM (24h)
  timezone: string; // Ex: "Europe/Paris"
}

/**
 * Statistiques d'usage OpenAI d'un appel (null si le fournisseur ne les a pas
 * retournées).
 */
export interface AIUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

/**
 * Erreur levée quand OpenAI répond sans résultat structuré exploitable.
 * Le nom est fixe pour que la journalisation puisse la reconnaître sans
 * importer ce module.
 */
export class AIInvalidResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIInvalidResponseError";
  }
}

/**
 * Log serveur compact et sûr d'une erreur d'extraction : jamais l'objet
 * d'erreur complet (il embarque les en-têtes de la réponse du fournisseur).
 */
function logSafeExtractionError(error: unknown): void {
  const safe = (value: unknown) => String(value ?? "n/a").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60);

  if (error instanceof OpenAI.APIError) {
    console.error(
      `Erreur lors de l'extraction IA: ${safe(error.name)} (status=${safe(error.status)}, code=${safe(error.code)})`
    );
  } else if (error instanceof Error) {
    console.error(`Erreur lors de l'extraction IA: ${safe(error.name)}`);
  } else {
    console.error("Erreur lors de l'extraction IA: erreur inconnue");
  }
}

/**
 * Extrait les informations d'une tâche à partir d'un texte en langage naturel
 *
 * @param text - Texte en langage naturel décrivant une tâche
 * @param context - Contexte temporel pour la résolution des dates relatives
 * @returns Promise<TaskExtraction> - Informations extraites structurées
 * @throws Error - Si l'appel OpenAI échoue ou retourne un résultat invalide
 */
export async function extractTaskFromText(
  text: string,
  context: ExtractionContext
): Promise<TaskExtraction> {
  const { extraction } = await extractTaskFromTextWithUsage(text, context);
  return extraction;
}

/**
 * Comme extractTaskFromText, mais retourne aussi les statistiques d'usage
 * OpenAI (tokens) pour la journalisation et le calcul du coût.
 *
 * `maxRetries: 1` du client fait qu'une action Gesia peut correspondre à
 * plusieurs requêtes HTTP vers OpenAI ; `usage` décrit la réponse finale.
 * En cas d'échec, l'erreur d'origine est conservée dans `cause`.
 */
export async function extractTaskFromTextWithUsage(
  text: string,
  context: ExtractionContext
): Promise<{ extraction: TaskExtraction; usage: AIUsage | null }> {
  // Validation du texte en entrée
  if (!text || typeof text !== "string" || text.length < 1 || text.length > 1000) {
    throw new Error("Texte invalide : doit être une chaîne de 1 à 1000 caractères");
  }

  // Validation du contexte
  if (!context.currentDate || !context.currentTime || !context.timezone) {
    throw new Error("Contexte temporel invalide : currentDate, currentTime et timezone sont requis");
  }

  try {
    // Construction du prompt système avec le contexte temporel explicite
    const systemPrompt = `Tu es un assistant spécialisé dans l'extraction de tâches à partir de texte en langage naturel.

Contexte temporel fourni :
- Date courante : ${context.currentDate}
- Heure courante : ${context.currentTime}
- Timezone : ${context.timezone}

Analyse le texte et extrait les informations suivantes :

1. **Titre** : Un titre clair et concis pour la tâche (max 500 caractères)

2. **Date d'échéance** : Si une date est présente dans le texte, convertis-la en format ISO 8601 (YYYY-MM-DD). Pour les expressions relatives comme "demain", "vendredi", "lundi prochain", utilise le contexte temporel fourni pour calculer la date absolue. Si aucune date n'est présente, retourne null.

3. **Heure d'échéance** : Si une heure est présente, convertis-la en format HH:MM (24h). Si aucune heure n'est présente, retourne null.

4. **Priorité** : Estime la priorité de la tâche :
   - HIGH : Urgent, critique, deadline stricte
   - MEDIUM : Normal, routine
   - LOW : Optionnel, sans urgence

5. **Catégorie** : Estime la catégorie de la tâche :
   - IMPORTANT : Critique, impact élevé
   - THIS_WEEK : À faire cette semaine
   - PARKING : Reportable, peut attendre
   - IDEA : Une idée, pas encore une action concrète

6. **Durée estimée** : Si le contexte permet d'inférer une durée en minutes, fournis-la. Sinon, retourne null.

IMPORTANT : Utilise le contexte temporel fourni pour résoudre toutes les expressions relatives. Ne suppose pas la date ou l'heure actuelle.`;

    // Appel à l'API OpenAI avec Responses API et Structured Outputs
    const response = await openai.responses.parse({
      model: AI_MODEL,
      input: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: text,
        },
      ],
      text: {
        format: zodTextFormat(TaskExtractionSchema, "task_extraction"),
      },
      temperature: 0.3, // Bas pour plus de précision
      max_output_tokens: 500,
    });

    // Récupération du résultat parsé automatiquement par le SDK
    const extraction = response.output_parsed;

    // Vérification qu'un résultat structuré existe
    if (!extraction) {
      throw new AIInvalidResponseError("Aucun résultat structuré retourné par l'IA");
    }

    // Validation supplémentaire (le SDK Zod garantit déjà le format)
    if (!extraction.title || typeof extraction.title !== "string") {
      throw new AIInvalidResponseError("Titre invalide dans la réponse IA");
    }

    // Usage retourné par OpenAI (optionnel dans le SDK) : null si absent
    const usage: AIUsage | null = response.usage
      ? {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          total_tokens: response.usage.total_tokens,
        }
      : null;

    return { extraction, usage };
  } catch (error) {
    logSafeExtractionError(error);

    // On propage l'erreur en conservant l'originale dans `cause`
    if (error instanceof Error) {
      throw new Error(`Erreur extraction IA: ${error.message}`, { cause: error });
    }

    throw new Error("Erreur inconnue lors de l'extraction IA", { cause: error });
  }
}
