import OpenAI from "openai";
import { prisma } from "./prisma";
import { getTodayInAppTimezone } from "./task-date";
import type { AIActionType, Plan } from "../generated/prisma/enums";

/**
 * Limitation mensuelle des actions IA et journalisation (AIUsageLog).
 *
 * Règle de comptage : chaque tentative d'appel OpenAI réservée compte pour
 * UNE action, qu'elle réussisse ou échoue (timeout, quota fournisseur...),
 * même si le client OpenAI réessaie en interne (`maxRetries`).
 * Source unique des limites : AI_MONTHLY_LIMITS.
 */

/** Actions IA autorisées par mois et par plan. */
export const AI_MONTHLY_LIMITS: Record<Plan, number> = {
  FREE: 50,
  PAID: 500,
};

/** Modèle inscrit sur une réservation, remplacé à la finalisation par le modèle réellement utilisé. */
const RESERVATION_MODEL = "gpt-4o-mini";

/** Marqueur d'une réservation dont l'appel OpenAI n'est pas encore finalisé (ou dont la finalisation a échoué). */
const PENDING_MARKER = "PENDING";

/**
 * Tarifs OpenAI en dollars par million de tokens, uniquement pour les modèles
 * dont le tarif est défini. À REVALIDER si OpenAI modifie ses tarifs.
 */
const AI_MODEL_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
};

export interface MonthPeriod {
  start: Date; // inclus
  end: Date; // exclu
}

export interface MonthlyUsage {
  used: number;
  limit: number;
  remaining: number;
}

export type ReserveAIActionResult =
  | ({ allowed: true; logId: string } & MonthlyUsage)
  | ({ allowed: false } & MonthlyUsage);

export type AIUsageResult =
  | { success: true; model: string; tokensInput: number | null; tokensOutput: number | null }
  | { success: false; model: string; errorCode: string };

/** Limite mensuelle d'actions IA pour un plan. */
export function getMonthlyLimit(plan: Plan): number {
  return AI_MONTHLY_LIMITS[plan];
}

/**
 * Mois civil courant dans Africa/Lome : du 1er jour 00:00 (inclus) au 1er
 * jour du mois suivant 00:00 (exclu). Le mois est déterminé par la date du
 * jour à Lomé (jamais par la timezone de la machine). La conversion en
 * instants UTC est exacte tant que la timezone métier est UTC+0 sans heure
 * d'été, comme pour la convention de stockage de `due_date`.
 */
export function getMonthPeriod(now: Date = new Date()): MonthPeriod {
  const [year, month] = getTodayInAppTimezone(now).split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

/**
 * Utilisation du mois courant : nombre d'AIUsageLog de l'utilisateur dans la
 * période (les tentatives échouées et les réservations comptent). Le plan est
 * lu en base, jamais fourni par le client. `remaining` n'est jamais négatif.
 */
export async function getMonthlyUsage(userId: string, now: Date = new Date()): Promise<MonthlyUsage> {
  const { start, end } = getMonthPeriod(now);

  const [user, used] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { plan: true } }),
    prisma.aIUsageLog.count({ where: { user_id: userId, created_at: { gte: start, lt: end } } }),
  ]);

  if (!user) {
    throw new Error("Utilisateur introuvable");
  }

  const limit = getMonthlyLimit(user.plan);
  return { used, limit, remaining: Math.max(0, limit - used) };
}

/**
 * Réserve atomiquement une action IA avant l'appel OpenAI.
 *
 * Dans une transaction, la ligne User est verrouillée (FOR NO KEY UPDATE) :
 * les réservations d'un même utilisateur passent l'une après l'autre, donc
 * deux requêtes simultanées à 49/50 ne peuvent pas toutes deux être
 * autorisées. Le plan est lu sous verrou, l'utilisation est comptée, puis
 * une ligne AIUsageLog "PENDING" est créée si la limite n'est pas atteinte.
 * Le verrou est relâché au commit, donc AVANT l'appel OpenAI.
 *
 * Si le processus plante avant la finalisation, la ligne PENDING reste et
 * continue de compter (comportement volontairement conservateur).
 *
 * Retour : `used` inclut l'action réservée quand elle est autorisée.
 */
export async function reserveAIAction(
  userId: string,
  actionType: AIActionType,
  now: Date = new Date()
): Promise<ReserveAIActionResult> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ plan: Plan }[]>`
        SELECT plan FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE
      `;

      if (rows.length === 0) {
        throw new Error("Utilisateur introuvable");
      }

      const limit = getMonthlyLimit(rows[0].plan);
      const { start, end } = getMonthPeriod(now);

      const used = await tx.aIUsageLog.count({
        where: { user_id: userId, created_at: { gte: start, lt: end } },
      });

      if (used >= limit) {
        return { allowed: false, used, limit, remaining: 0 };
      }

      const log = await tx.aIUsageLog.create({
        data: {
          user_id: userId,
          action_type: actionType,
          model_used: RESERVATION_MODEL,
          estimated_cost: 0,
          success: false,
          error_message: PENDING_MARKER,
          created_at: now,
        },
        select: { id: true },
      });

      return {
        allowed: true,
        logId: log.id,
        used: used + 1,
        limit,
        remaining: limit - (used + 1),
      };
    },
    // Les valeurs par défaut de Prisma sont trop courtes face aux pics de
    // latence PostgreSQL déjà observés.
    { maxWait: 10_000, timeout: 20_000 }
  );
}

/**
 * Coût estimé en dollars, calculé côté serveur à partir des tokens réels.
 * Retourne 0 quand le coût est impossible à calculer (tokens absents ou
 * modèle sans tarif défini) : 0 signifie alors "inconnu", pas "gratuit".
 * La colonne AIUsageLog.estimated_cost est en Decimal(10,4) : la base arrondit
 * à 0,0001 $ ; les tokens, stockés exactement, permettent de recalculer.
 */
export function estimateAICost(
  model: string,
  tokensInput: number | null,
  tokensOutput: number | null
): number {
  const pricing = AI_MODEL_PRICING[model];
  if (!pricing || tokensInput === null || tokensOutput === null) {
    return 0;
  }

  return (tokensInput * pricing.inputPerMillion + tokensOutput * pricing.outputPerMillion) / 1_000_000;
}

function isInsufficientQuota(error: { code?: string | null; type?: string }): boolean {
  return (
    error.type === "insufficient_quota" ||
    error.code === "insufficient_quota" ||
    error.code === "credit_balance_exhausted"
  );
}

/** Code sûr pour une erreur seule (sans parcourir la chaîne `cause`). */
function classifyError(error: unknown): string | null {
  if (error instanceof OpenAI.APIConnectionTimeoutError) return "OPENAI_TIMEOUT";
  if (error instanceof OpenAI.APIConnectionError) return "OPENAI_CONNECTION_ERROR";

  if (error instanceof OpenAI.APIError && typeof error.status === "number") {
    if (error.status === 429 && isInsufficientQuota(error)) return "OPENAI_429_INSUFFICIENT_QUOTA";
    return `OPENAI_HTTP_${error.status}`;
  }

  if (error instanceof Error && error.name === "AIInvalidResponseError") return "INVALID_RESPONSE";

  return null;
}

/**
 * Transforme une erreur en code court et sûr (vocabulaire fermé) pour
 * AIUsageLog.error_message. Ne retourne jamais le message brut, les en-têtes,
 * la clé API, un cookie ou un payload : uniquement des codes fixes.
 */
export function describeAIError(error: unknown): string {
  let current: unknown = error;

  for (let depth = 0; depth < 5 && current; depth++) {
    const code = classifyError(current);
    if (code) return code;
    current = (current as { cause?: unknown }).cause;
  }

  return "UNKNOWN";
}

/**
 * Finalise la réservation après l'appel OpenAI. Ne modifie que les lignes
 * encore PENDING (finalisation idempotente). Retourne false si aucune ligne
 * n'a été mise à jour.
 *
 * Succès : tokens, coût estimé, error_message = null.
 * Échec : success = false et un code d'erreur sûr, jamais le message brut.
 */
export async function finalizeAIUsage(logId: string, result: AIUsageResult): Promise<boolean> {
  const where = { id: logId, success: false, error_message: PENDING_MARKER };

  if (result.success) {
    const { count } = await prisma.aIUsageLog.updateMany({
      where,
      data: {
        success: true,
        model_used: result.model,
        tokens_input: result.tokensInput,
        tokens_output: result.tokensOutput,
        estimated_cost: estimateAICost(result.model, result.tokensInput, result.tokensOutput),
        error_message: null,
      },
    });
    return count === 1;
  }

  // Garde-fou : seul un code du vocabulaire fermé peut être stocké.
  const errorCode = /^[A-Z0-9_]{1,64}$/.test(result.errorCode) ? result.errorCode : "UNKNOWN";

  const { count } = await prisma.aIUsageLog.updateMany({
    where,
    data: { success: false, model_used: result.model, error_message: errorCode },
  });
  return count === 1;
}
