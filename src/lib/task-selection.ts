import { isTaskOverdue } from "./task-date";

/** Nombre maximum de tâches recommandées par « Que dois-je faire maintenant ? ». */
export const MAX_NEXT_TASKS = 3;

export interface SelectableTask {
  id: string;
  status: string;
  due_date: string | null; // "YYYY-MM-DD"
  due_time: string | null; // "HH:MM" (24h)
  priority: string | null; // HIGH | MEDIUM | LOW | null
  estimated_duration_minutes: number | null;
  created_at: Date;
}

const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
// priority null (ou inconnue) : après LOW, sans jamais être remplacée par MEDIUM.
const NO_PRIORITY_RANK = 3;

interface RankedTask<T> {
  task: T;
  isOverdue: boolean;
  deadline: string | null;
  priorityRank: number;
}

/**
 * Moment d'échéance sous forme de chaîne comparable "YYYY-MM-DDTHH:MM".
 * - sans due_date : aucune échéance (même si due_time est renseigné) ;
 * - sans due_time : fin de journée. "24:00" est utilisé uniquement comme
 *   clé de tri pour classer la tâche après toute tâche horodatée du même jour.
 */
function getDeadlineKey(task: SelectableTask): string | null {
  if (!task.due_date) return null;
  return `${task.due_date}T${task.due_time ?? "24:00"}`;
}

/**
 * Comparateur des recommandations. Chaque critère ne départage que les
 * tâches à égalité sur les précédents (aucun score numérique) :
 *
 * 1. retard : les tâches en retard d'abord ;
 * 2. échéance : moment d'échéance le plus ancien d'abord (donc, parmi les
 *    retards, les plus anciens en premier) ; sans échéance en dernier ;
 * 3. priorité : HIGH, MEDIUM, LOW, puis null ;
 * 4. durée estimée : la plus courte d'abord ; durée inconnue après les durées connues ;
 * 5. création : la plus récente d'abord ;
 * 6. id : départage technique pour un ordre totalement déterministe.
 *
 * La catégorie n'intervient jamais.
 */
function compareRanked<T extends SelectableTask>(a: RankedTask<T>, b: RankedTask<T>): number {
  if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;

  if (a.deadline !== b.deadline) {
    if (a.deadline === null) return 1;
    if (b.deadline === null) return -1;
    return a.deadline < b.deadline ? -1 : 1;
  }

  if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;

  const durationA = a.task.estimated_duration_minutes;
  const durationB = b.task.estimated_duration_minutes;
  if (durationA !== durationB) {
    if (durationA === null) return 1;
    if (durationB === null) return -1;
    return durationA - durationB;
  }

  const createdDiff = b.task.created_at.getTime() - a.task.created_at.getTime();
  if (createdDiff !== 0) return createdDiff;

  if (a.task.id === b.task.id) return 0;
  return a.task.id < b.task.id ? -1 : 1;
}

/**
 * Sélectionne les tâches à recommander maintenant : uniquement les tâches
 * TODO, classées par le comparateur ci-dessus, limitées à `limit`.
 * Le retard est calculé avec isTaskOverdue (timezone Africa/Lome) ; `now`
 * est injectable pour les tests.
 *
 * Le tri se fait en mémoire, sur les seules tâches TODO d'un utilisateur :
 * le retard et la fin de journée ne s'expriment pas en SQL, et ce volume
 * reste raisonnable pour le MVP.
 */
export function selectNextTasks<T extends SelectableTask>(
  tasks: T[],
  now: Date = new Date(),
  limit: number = MAX_NEXT_TASKS
): Array<T & { is_overdue: boolean }> {
  return tasks
    .filter((task) => task.status === "TODO")
    .map((task) => ({
      task,
      isOverdue: isTaskOverdue(
        { status: task.status, due_date: task.due_date, due_time: task.due_time },
        now
      ),
      deadline: getDeadlineKey(task),
      priorityRank:
        task.priority !== null ? (PRIORITY_RANK[task.priority] ?? NO_PRIORITY_RANK) : NO_PRIORITY_RANK,
    }))
    .sort(compareRanked)
    .slice(0, limit)
    .map(({ task, isOverdue }) => ({ ...task, is_overdue: isOverdue }));
}
