# Progression du projet

## État actuel

Phase : Architecture

Étape actuelle : Mise en place de PostgreSQL + Prisma 7

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

---

## EN COURS

- [ ] Configuration PostgreSQL (Supabase)
- [ ] Configuration Prisma 7 avec adapter

---

## À FAIRE

- [ ] Configuration Supabase Auth avec @supabase/ssr
- [ ] Validation 0fee.dev (abonnements récurrents SaaS)
- [ ] Configuration OpenAI (Structured Outputs)
- [ ] Authentification (inscription/connexion)
- [ ] Capture rapide
- [ ] Inbox
- [ ] Priorisation
- [ ] Anti-backlog
- [ ] Abonnement
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