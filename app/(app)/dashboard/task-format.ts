/**
 * Présentation partagée des tâches (libellés FR, formatage des dates).
 * Aucune règle métier ici : uniquement de l'affichage.
 */

export type PriorityValue = "HIGH" | "MEDIUM" | "LOW";
export type StatusValue = "TODO" | "DONE" | "ARCHIVED";

export const PRIORITY_LABELS: Record<PriorityValue, string> = {
  HIGH: "Haute",
  MEDIUM: "Moyenne",
  LOW: "Basse",
};

export function isStatusValue(value: unknown): value is StatusValue {
  return value === "TODO" || value === "DONE" || value === "ARCHIVED";
}

const MONTH_NAMES_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/**
 * Formate une date "YYYY-MM-DD" en date FR lisible sans passer par `new Date()`,
 * pour éviter tout décalage lié à la timezone du navigateur. Le projet utilise
 * une timezone fixe MVP (Africa/Lome) côté backend ; on affiche donc la date
 * métier reçue telle quelle, sans réinterprétation.
 */
export function formatDueDate(dueDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!match) return dueDate;
  const [, year, month, day] = match;
  const monthName = MONTH_NAMES_FR[Number(month) - 1];
  return monthName ? `${Number(day)} ${monthName} ${year}` : dueDate;
}

/**
 * Ajoute `days` jours à une date "YYYY-MM-DD" par arithmétique calendaire
 * UTC (indépendante de toute timezone).
 */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const y = String(shifted.getUTCFullYear()).padStart(4, "0");
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Libellé d'échéance pour la vue « Que dois-je faire maintenant ? » :
 * "Aujourd'hui · 15:00", "Demain · 10:00", "18 septembre 2026" ou
 * "Sans échéance". `today` est la date du jour ("YYYY-MM-DD") fournie par
 * l'appelant ; elle ne sert qu'à choisir le libellé, jamais à classer.
 * Sans due_date, un due_time seul est ignoré (aucune échéance).
 */
export function formatDeadline(dueDate: string | null, dueTime: string | null, today: string): string {
  if (!dueDate) return "Sans échéance";

  let label: string;
  if (dueDate === today) {
    label = "Aujourd'hui";
  } else if (dueDate === addDays(today, 1)) {
    label = "Demain";
  } else {
    label = formatDueDate(dueDate);
  }

  return dueTime ? `${label} · ${dueTime}` : label;
}
