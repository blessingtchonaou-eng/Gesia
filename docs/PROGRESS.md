# Progression du projet

## État actuel

Phase : Capture rapide

Étape actuelle : Parcours de capture complet (texte + vocal + validation + création) et lecture des tâches terminés côté backend et frontend. Reste l'affichage d'une liste/Inbox.

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
- [x] Configuration PostgreSQL (Supabase) + Prisma 7 avec adapter
- [x] Configuration Supabase Auth avec @supabase/ssr (inscription/connexion/déconnexion, synchronisation User via ensureUserExists)
- [x] Configuration OpenAI (Structured Outputs) — `src/lib/ai-service.ts`
- [x] `POST /api/tasks/capture` — intégration de l'extraction IA (titre, date, heure, priorité et catégorie proposées) avec fallback `ai_failed` si l'IA échoue
- [x] `POST /api/tasks` — création définitive d'une `Task`, en conservant à la fois les valeurs validées par l'utilisateur et les propositions IA d'origine (`priority_ia_proposed`, `category_ia_proposed`)
- [x] Interface de capture (`task-capture.tsx`, `task-proposal-form.tsx`, `use-speech-recognition.ts`) — saisie texte + vocale (SpeechRecognition native, `fr-FR`), validation/édition des propositions IA, confirmation et création de tâche depuis le dashboard
- [x] `GET /api/tasks` — récupération des tâches de l'utilisateur authentifié, triées par échéance proche puis date de création, isolation par utilisateur vérifiée

---

## EN COURS

- [ ] —

---

## À FAIRE

- [ ] Validation 0fee.dev (abonnements récurrents SaaS)
- [ ] Inbox (affichage de la liste des tâches)
- [ ] Priorisation ("Que dois-je faire maintenant ?")
- [ ] Anti-backlog
- [ ] Abonnement
- [ ] Journalisation IA (AIUsageLog)
- [ ] Tests
- [ ] Déploiement

---

## RÉSERVES TECHNIQUES

### 0fee.dev - Paiement
- **Statut** : Candidat principal, mais validation requise
- **Point à valider** : Support spécifique des abonnements récurrents SaaS
- **Alternatives** : Flutterwave ou PaiementPro si 0fee.dev ne convient pas
- **Action requise** : Tester la sandbox pour les paiements récurrents avant engagement définitif

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