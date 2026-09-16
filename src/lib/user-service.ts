import { prisma } from "./prisma";

/**
 * Récupère un utilisateur Gesia par son Supabase User ID
 */
export async function getUserBySupabaseId(supabaseUserId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { supabase_user_id: supabaseUserId },
    });
    return user;
  } catch (error) {
    console.error("Erreur lors de la récupération de l'utilisateur:", error);
    throw error;
  }
}

/**
 * Crée un nouvel utilisateur Gesia à partir d'un Supabase User ID
 */
export async function createUser(supabaseUserId: string) {
  try {
    const user = await prisma.user.create({
      data: {
        supabase_user_id: supabaseUserId,
        // plan utilise la valeur par défaut Prisma: FREE
      },
    });
    return user;
  } catch (error) {
    console.error("Erreur lors de la création de l'utilisateur:", error);
    throw error;
  }
}

/**
 * Assure qu'un utilisateur Gesia existe pour un Supabase User ID
 * Utilise upsert atomique pour éviter les problèmes de concurrence
 */
export async function ensureUserExists(supabaseUserId: string) {
  try {
    const user = await prisma.user.upsert({
      where: { supabase_user_id: supabaseUserId },
      create: {
        supabase_user_id: supabaseUserId,
        // plan utilise la valeur par défaut Prisma: FREE
      },
      update: {}, // Pas de mise à jour si l'utilisateur existe déjà
    });
    return user;
  } catch (error) {
    console.error("Erreur lors de la vérification/création de l'utilisateur:", error);
    throw error;
  }
}
