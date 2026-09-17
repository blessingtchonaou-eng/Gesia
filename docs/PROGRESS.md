# Progression du projet

## État actuel

Phase : Capture rapide (backend)

Étape actuelle : Backend de capture terminé (extraction IA + création de tâche). Reste l'interface utilisateur de capture.

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

---

## EN COURS

- [ ] Interface de capture (formulaire de saisie + validation des propositions IA)

---

## À FAIRE

- [ ] Validation 0fee.dev (abonnements récurrents SaaS)
- [ ] Inbox
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