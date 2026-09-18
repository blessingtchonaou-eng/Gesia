# Progression du projet

## État actuel

Phase : Cœur de la gestion de tâches (capture, liste, terminer, retard, anti-backlog)

Dernier état validé : commit `0cff646` — `feat: add overdue task actions`.

Étape actuelle : Anti-backlog terminé (Faire aujourd'hui, Reporter, Archiver, Supprimer). Aucune étape en cours ; la prochaine est à définir (voir « À FAIRE »).

---

## TERMINÉ

- [x] Création du projet Next.js
- [x] Configuration TypeScript
- [x] Configuration ESLint
- [x] Configuration Tailwind CSS
- [x] Configuration App Router
- [x] Analyse du projet
- [x] Architecture technique validée
- [x] Documentation de l'architecture (docs/ARCHITECTURE.md)
### Socle technique
- [x] Configuration PostgreSQL (Supabase) + Prisma 7 avec adapter (`@prisma/adapter-pg`)
- [x] Supabase Auth avec `@supabase/ssr` : inscription, connexion, déconnexion, protection des routes `(app)`, synchronisation du `User` Gesia via `ensureUserExists`
- [x] RLS Supabase + policies métier (configurées côté Supabase, non versionnées dans le repo). L'accès applicatif passe par Prisma côté serveur ; l'isolation entre utilisateurs est en plus assurée dans le code (filtre `Task.user_id` = `User.id` interne, jamais fourni par le client)
- [x] Configuration OpenAI (Structured Outputs, GPT-4o-mini) — `src/lib/ai-service.ts`

### Capture
- [x] Capture texte — zone de saisie (1 à 1000 caractères) et validation avant création (`task-capture.tsx`, `task-proposal-form.tsx`)
- [x] Capture vocale navigateur — `SpeechRecognition` native, `fr-FR`, transcription insérée dans le même champ que la saisie texte, jamais d'analyse automatique (`use-speech-recognition.ts`)
- [x] `POST /api/tasks/capture` — extraction IA (titre, date, heure, priorité et catégorie proposées, durée estimée), sans écriture en base, avec fallback `ai_failed` si l'IA échoue (commit `36b712a`)
- [x] `POST /api/tasks` — création définitive d'une `Task`, en conservant séparément les valeurs validées par l'utilisateur (`priority`, `category`) et les propositions IA d'origine (`priority_ia_proposed`, `category_ia_proposed`) (commit `a32b068`)

### Liste et cycle de vie d'une tâche
- [x] `GET /api/tasks` — tâches de l'utilisateur authentifié uniquement, triées par échéance proche (sans date en dernier) puis par création décroissante, isolation utilisateur vérifiée (commit `545b70b`)
- [x] Affichage des tâches dans le dashboard — `task-list.tsx` (chargement, erreur avec « Réessayer », état vide, dates formatées sans décalage de timezone) et rafraîchissement par `refreshKey` via `dashboard-tasks.tsx` (commit `6c1b956`)
- [x] Marquer une tâche comme terminée — `PATCH /api/tasks/[id]` : `TODO → DONE` uniquement, `DONE → DONE` idempotent (200), `ARCHIVED` refusé (409), vérification `Task.id + user_id`, bouton « Terminer » réservé aux tâches `TODO` (commit `05497ca`)
- [x] Détection dynamique `is_overdue` — calculée à la lecture dans `GET /api/tasks` par `src/lib/task-date.ts` (jamais stockée, aucun statut `OVERDUE`). Règle : `TODO` avec `due_date` uniquement ; avec `due_time`, comparaison à la minute dans `Africa/Lome` ; sans `due_time`, échéance = fin de journée ; jamais pour `DONE`, `ARCHIVED` ou sans date. Badge « Échéance dépassée » (commit `1fe35fd`)
- [x] Anti-backlog — `POST /api/tasks/[id]/overdue-action` et `overdue-decision-panel.tsx`, réservés aux tâches `TODO` en retard (éligibilité revérifiée côté serveur, mutations conditionnelles, 409 sinon) (commit `0cff646`) :
  - Faire aujourd'hui : `due_date` = aujourd'hui (`Africa/Lome`), `due_time` = `null`, reste `TODO`
  - Reporter : nouvelle date obligatoire, heure optionnelle, jamais immédiatement en retard, sans plafond de date
  - Archiver : `status = ARCHIVED`, aucun autre champ modifié
  - Supprimer : suppression définitive avec confirmation inline

### Validation
- [x] Tests fonctionnels manuels réalisés pour chaque fonctionnalité ci-dessus (cas nominaux, erreurs 400/401/404/409, isolation entre utilisateurs, double soumission, erreur réseau), avec nettoyage des données de test

---

## EN COURS

- [ ] —

---

## À FAIRE

- [ ] Validation 0fee.dev (abonnements récurrents SaaS)
- [ ] Inbox : vue dédiée / classification par catégorie (Important / Cette semaine / Parking / Idée). Une liste unique des tâches est déjà affichée
- [ ] Priorisation (« Que dois-je faire maintenant ? »)
- [ ] Anti-backlog : liste filtrable des tâches en retard (prévue au cahier des charges §4.4, reportée)
- [ ] Abonnement (plan gratuit / payant, limites d'usage IA, paiement, gestion)
- [ ] Journalisation IA (`AIUsageLog`) et limites d'actions IA
- [ ] Tests automatisés (aucun framework de test n'est installé à ce stade)
- [ ] Déploiement (variables d'environnement, build production, base de production, monitoring)

---

## RÉSERVES TECHNIQUES

### 0fee.dev - Paiement
- **Statut** : Candidat principal, mais validation requise
- **Point à valider** : Support spécifique des abonnements récurrents SaaS
- **Alternatives** : Flutterwave ou PaiementPro si 0fee.dev ne convient pas
- **Action requise** : Tester la sandbox pour les paiements récurrents avant engagement définitif

### OpenAI - Chemin de succès non validé en conditions réelles
- **Constat** : lors des derniers tests, le compte OpenAI renvoyait `429 insufficient_quota` (crédits épuisés)
- **Conséquence** : le fallback `ai_failed: true` est validé, mais l'extraction IA réussie (`ai_failed: false`) n'a pas été vérifiée de bout en bout avec de vrais crédits
- **Action requise** : recharger le compte puis valider l'extraction réelle (dates relatives, priorité, catégorie, durée)

### Timezone MVP fixe
- **Statut** : `Africa/Lome` est écrite en dur (capture, contexte temporel de l'IA, calcul de `is_overdue`, actions anti-backlog)
- **Point d'attention** : `due_date` est stocké à minuit UTC, ce qui correspond au jour métier tant que la timezone est UTC+0 sans heure d'été. Une timezone par utilisateur demandera de revoir ces points

### Limitations connues (volontaires à ce stade)
- Les tâches `ARCHIVED` restent affichées dans la liste ; pas de désarchivage ni de retour `DONE → TODO`
- La suppression (anti-backlog) est définitive : pas de suppression logique ni d'historique des reports
- `is_overdue` est recalculé à la lecture : une tâche qui dépasse son échéance pendant que la page est ouverte n'est mise à jour qu'au prochain rafraîchissement (pas de polling)
- Aucune modification d'une tâche existante (titre, date, priorité, catégorie) en dehors des actions ci-dessus

### Documentation à synchroniser
- `docs/PROJECT_PLAN.md` et la section 13 de `docs/CAHIER_DES_CHARGES.md` ne sont pas à jour (aucune case cochée) ; `docs/PROGRESS.md` fait foi pour l'avancement

---

## NOTES IMPORTANTES

### Stack Technique Validée
- **Frontend** : Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4
- **Backend** : API Routes Next.js (intégré)
- **Base de données** : PostgreSQL via Supabase
- **ORM** : Prisma 7 (version stable) avec adapter @prisma/adapter-pg
- **Authentification** : Supabase Auth avec @supabase/ssr (PAS auth-helpers)
- **IA** : OpenAI GPT-4o-mini avec Structured Outputs
- **Paiement** : 0fee.dev (validation requise)

### Contraintes Techniques
- NE PAS utiliser @supabase/auth-helpers-nextjs (déprécié)
- NE PAS mélanger Supabase Auth avec NextAuth/Auth.js
- Prisma 7 REQUIERT un driver adapter (@prisma/adapter-pg)
- OpenAI API engendre des coûts réels (indépendant de Windsurf)
- Variables NEXTAUTH_SECRET et NEXTAUTH_URL non nécessaires avec Supabase Auth