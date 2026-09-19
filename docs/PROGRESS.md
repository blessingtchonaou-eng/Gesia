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

### Journalisation IA et limites d'actions IA
- [x] Limite mensuelle d'actions IA par plan, lue depuis `User.plan` : `FREE` = 50, `PAID` = 500. Les valeurs sont définies dans le code (`AI_MONTHLY_LIMITS`, `src/lib/ai-usage.ts`), sans variable d'environnement
- [x] Période mensuelle = mois civil dans `Africa/Lome` (du 1er 00:00 inclus au 1er du mois suivant exclu). Aucun cron, job de reset ni compteur stocké : l'usage est le nombre d'`AIUsageLog` du mois, donc le « reset » est automatique au changement de mois
- [x] Réservation atomique avant l'appel OpenAI — `reserveAIAction` : transaction Prisma avec verrou `SELECT ... FOR NO KEY UPDATE` sur la ligne `User`, lecture du plan, comptage du mois, refus si `used >= limit`, sinon création d'un `AIUsageLog` (`CAPTURE`, `gpt-4o-mini`, `success = false`, `error_message = "PENDING"`, coût 0). Le verrou est relâché avant l'appel OpenAI. Protège contre les dépassements en cas de requêtes concurrentes
- [x] Finalisation après l'appel — `finalizeAIUsage` : succès = `success = true`, `tokens_input`/`tokens_output` et `estimated_cost` (0,15 $ / 0,60 $ par million de tokens, `gpt-4o-mini` uniquement), `error_message = null` ; échec = `success = false` et code d'erreur sûr (`OPENAI_429_INSUFFICIENT_QUOTA`, `OPENAI_TIMEOUT`, `OPENAI_HTTP_<statut>`, `INVALID_RESPONSE`, `UNKNOWN`…), jamais le message brut d'OpenAI. Si les tokens sont indisponibles, `estimated_cost = 0` signifie « coût inconnu », pas « gratuit »
- [x] Un appel OpenAI échoué compte comme UNE action Gesia, y compris quand le client OpenAI réessaie en interne (`maxRetries: 1`)
- [x] `POST /api/tasks/capture` — flux : authentification (401) → validation (400) → `ensureUserExists` → `reserveAIAction` → quota atteint : `429` `AI_USAGE_LIMIT_REACHED` avec `usage: { used, limit }`, sans appel OpenAI ni fallback → appel OpenAI → `finalizeAIUsage` → réponse habituelle ou fallback `ai_failed`. Un `429` Gesia (quota mensuel du plan) est distinct d'un `429` OpenAI (quota fournisseur), qui donne le fallback `ai_failed: true` avec le log `OPENAI_429_INSUFFICIENT_QUOTA`. Les 401 et 400 ne créent aucun log
- [x] Échec technique de la réservation ou de `ensureUserExists` : `500`, sans appel OpenAI. Échec de la finalisation après un appel réussi : la réponse de succès est conservée et la réservation `PENDING` reste (elle compte toujours)
- [x] Les logs applicatifs d'erreur IA sont compacts (statut, code) : plus d'objet d'erreur OpenAI complet
- [x] Aucune modification du schéma Prisma, aucune migration, aucune modification du frontend
- [x] Validation : script de test ponctuel (non versionné) sur la vraie base, 34 vérifications réussies sur 34 — limites FREE/PAID, concurrence (49/50 × 2, 45/50 × 10), changement de mois, calcul du coût, 401/400, quota 429, erreur OpenAI avec fallback, succès OpenAI, absence de secrets dans les logs — avec nettoyage complet des données de test. OpenAI et Supabase Auth y étaient simulés

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
- [ ] Abonnement (plan gratuit / payant, paiement, gestion). Les limites d'usage IA par plan sont déjà appliquées (voir « Journalisation IA et limites d'actions IA »)
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

### Limites connues de la limitation IA
- Seule l'action `CAPTURE` est journalisée et limitée ; `CLASSIFY` (présent dans l'enum) n'est pas implémenté
- Une réservation dont la finalisation échoue (ou dont le processus plante) reste `PENDING` et compte dans le quota ; aucune purge ni réconciliation
- `estimated_cost` est arrondi à 0,0001 $ par la colonne `Decimal(10,4)` (ex. 0,00045 $ stocké 0,0005 $) ; les tokens, stockés exacts, permettent de recalculer
- Les tarifs (`gpt-4o-mini`) sont écrits en dur : à revalider si OpenAI les modifie ; aucun tarif pour les autres modèles (coût 0 = inconnu)
- La conversion du mois en instants UTC suppose `Africa/Lome` en UTC+0 sans heure d'été (comme `due_date`) ; une timezone par utilisateur demandera de la revoir
- Le chemin de succès OpenAI n'a été validé qu'avec OpenAI simulé, faute de crédits (voir réserve ci-dessus)
- Aucune API ni interface n'expose encore l'usage restant à l'utilisateur ; l'endpoint `ai/usage` prévu dans l'architecture n'existe pas
- Les limites sont modifiables uniquement par changement de code

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