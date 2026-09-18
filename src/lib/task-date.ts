/**
 * Timezone de référence du MVP Gesia. Toutes les comparaisons d'échéance se
 * font dans cette timezone, jamais dans celle du serveur ou du navigateur.
 */
export const APP_TIMEZONE = "Africa/Lome";

const localNowFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  // h23 évite l'heure "24:00" que certains moteurs renvoient à minuit.
  hourCycle: "h23",
});

/**
 * Date ("YYYY-MM-DD") et heure ("HH:MM") courantes dans APP_TIMEZONE.
 * Le formatteur n'expose pas les secondes : l'heure est donc tronquée à la
 * minute, ce qui correspond à la précision de `due_time`.
 */
function getLocalDateAndTime(now: Date): { date: string; time: string } {
  const parts = Object.fromEntries(
    localNowFormatter.formatToParts(now).map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

interface OverdueCheckInput {
  status: string;
  due_date: string | null; // "YYYY-MM-DD"
  due_time: string | null; // "HH:MM" (24h)
}

/**
 * Indique si une tâche est actuellement en retard. Propriété calculée à la
 * lecture, jamais stockée en base.
 *
 * Règles :
 * - seule une tâche TODO avec une due_date peut être en retard (DONE,
 *   ARCHIVED et tâches sans date : jamais) ;
 * - avec due_time : en retard dès la minute suivant l'échéance. due_time
 *   n'a qu'une précision à la minute, donc l'heure courante est comparée à
 *   la minute (15:00:00 à 15:00:59 => pas en retard, 15:01:00 => en retard) ;
 * - sans due_time : l'échéance est la fin de la journée. La tâche n'est en
 *   retard qu'à partir du lendemain 00:00, jamais dès le matin du jour J.
 *
 * `now` est injectable pour pouvoir tester les frontières.
 */
export function isTaskOverdue(task: OverdueCheckInput, now: Date = new Date()): boolean {
  if (task.status !== "TODO" || !task.due_date) {
    return false;
  }

  const local = getLocalDateAndTime(now);

  if (!task.due_time) {
    return local.date > task.due_date;
  }

  // Chaînes zéro-paddées "YYYY-MM-DDTHH:MM" : l'ordre lexicographique
  // correspond à l'ordre chronologique.
  return `${local.date}T${local.time}` > `${task.due_date}T${task.due_time}`;
}

/** Date du jour ("YYYY-MM-DD") dans APP_TIMEZONE. */
export function getTodayInAppTimezone(now: Date = new Date()): string {
  return getLocalDateAndTime(now).date;
}

/**
 * Convention de stockage de `due_date` (identique à POST /api/tasks) : un
 * jour "YYYY-MM-DD" est enregistré à minuit UTC. C'est le jour métier exact
 * tant que APP_TIMEZONE est UTC+0 (Africa/Lome, sans heure d'été).
 */
export function dueDateToStoredValue(dueDate: string): Date {
  return new Date(`${dueDate}T00:00:00.000Z`);
}

/** Vrai si `value` est une chaîne "YYYY-MM-DD" représentant un jour réel. */
export function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Vrai si `value` est une chaîne "HH:MM" au format 24h. */
export function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export type NewDeadlineCheck =
  | { ok: true }
  | { ok: false; reason: "PAST_DATE" | "PAST_TIME_TODAY" };

/**
 * Vérifie qu'une nouvelle échéance (report) n'est jamais immédiatement
 * dépassée :
 * - date antérieure à aujourd'hui : refusée ;
 * - date future : acceptée ;
 * - aujourd'hui sans heure : acceptée (échéance = fin de journée) ;
 * - aujourd'hui avec heure : l'heure doit être strictement future (minute
 *   courante exclue), sinon la tâche serait en retard dans la minute.
 */
export function checkNewDeadline(
  dueDate: string,
  dueTime: string | null,
  now: Date = new Date()
): NewDeadlineCheck {
  const local = getLocalDateAndTime(now);

  if (dueDate < local.date) return { ok: false, reason: "PAST_DATE" };
  if (dueDate > local.date || !dueTime) return { ok: true };

  return dueTime > local.time ? { ok: true } : { ok: false, reason: "PAST_TIME_TODAY" };
}
