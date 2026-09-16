# Architecture Technique - Gesia MVP

**Version** : 1.0  
**Date** : 2026-09-10  
**Statut** : Validée pour développement (avec réserve sur 0fee.dev)

---

## Vue d'ensemble

Gesia est un assistant intelligent de gestion de tâches construit comme une application web moderne. L'architecture privilégie la simplicité, la maintenabilité et l'adéquation aux besoins du MVP.

**Promesse centrale** : *"Moins gérer ses tâches. Plus les accomplir."*

---

## Stack Technique

### Frontend
- **Framework** : Next.js 16 (App Router)
- **UI Library** : React 19
- **Language** : TypeScript 5
- **Styling** : Tailwind CSS 4
- **Approche** : Server Components par défaut

### Backend
- **API** : API Routes Next.js (intégré)
- **Base de données** : PostgreSQL via Supabase
- **ORM** : Prisma 7 (version stable)
- **Driver PostgreSQL** : `@prisma/adapter-pg` + `pg`

### Authentification
- **Solution** : Supabase Auth (GoTrue)
- **Package** : `@supabase/ssr` + `@supabase/supabase-js`
- **⚠️ Important** : NE PAS utiliser `@supabase/auth-helpers-nextjs` (déprécié)

### Intelligence Artificielle
- **Fournisseur** : OpenAI
- **Modèle** : GPT-4o-mini
- **Fonctionnalité** : Structured Outputs pour extraction de données
- **⚠️ Coûts** : API OpenAI indépendante, engendre des coûts réels

### Paiement
- **Solution** : 0fee.dev (candidat principal)
- **⚠️ Réserve** : Validation requise sur les abonnements récurrents SaaS
- **Alternative** : Flutterwave ou PaiementPro si 0fee.dev ne convient pas

### Tests
- **Unitaires** : Jest + React Testing Library
- **E2E** : Playwright
- **Installation** : Plus tard dans le développement

### Déploiement
- **Platforme** : Vercel
- **Base de données** : Supabase (managée)

---

## Architecture détaillée

### 1. Base de données : PostgreSQL avec Supabase

**Choix** : Supabase comme backend-as-a-service complet

**Pourquoi** :
- PostgreSQL standard avec UI d'administration
- Authentification intégrée (GoTrue)
- Stockage, realtime, edge functions disponibles
- Réduit la complexité pour un développeur solo
- Environnement gratuit généreux pour le développement

**Variables d'environnement** :
```env
DATABASE_URL=postgresql://postgres:[password]@db.[project-id].supabase.co:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://[project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
```

**Alternatives considérées** :
- Neon : Serveurless Postgres pur avec scale-to-zero, mais nécessite de construire l'authentification soi-même

---

### 2. ORM : Prisma 7

**Choix** : Prisma 7 (version stable actuelle)

**Pourquoi** :
- ORM moderne type-safe pour TypeScript
- Excellent support PostgreSQL
- Migration automatique de schéma
- Intègre parfaitement avec Next.js
- Version stable (Prisma 8 est encore en release candidate)

**Configuration importante** :
- Prisma 7 **requiert obligatoirement** un driver adapter
- Pour PostgreSQL : `@prisma/adapter-pg` + `pg`
- Adapter obligatoire pour se connecter à la base de données

**Exemple de configuration** :
```typescript
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
});

export const prisma = new PrismaClient({ adapter });
```

**Variables d'environnement** :
```env
DATABASE_URL=postgresql://postgres:[password]@db.[project-id].supabase.co:5432/postgres
```

---

### 3. Authentification : Supabase Auth avec @supabase/ssr

**Choix** : `@supabase/ssr` + `@supabase/supabase-js`

**Pourquoi** :
- Intégré avec Supabase - pas de configuration supplémentaire
- Support email/password et OAuth (Google, GitHub, etc.)
- Gestion automatique des sessions
- Sécurité déjà implémentée (RLS, JWT)
- `@supabase/ssr` est le package officiel pour Next.js 15+ App Router

**⚠️ Important** :
- NE PAS utiliser `@supabase/auth-helpers-nextjs` (déprécié)
- NE PAS mélanger avec NextAuth/Auth.js
- Utiliser uniquement `@supabase/ssr`

**Pattern de configuration** :

**Client pour composants browser** :
```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Client pour composants server** :
```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
```

**Note** : Les variables `NEXTAUTH_SECRET` et `NEXTAUTH_URL` ne sont PAS nécessaires avec Supabase Auth.

---

### 4. Intelligence Artificielle : OpenAI GPT-4o-mini

**Choix** : OpenAI GPT-4o-mini avec Structured Outputs

**Pourquoi** :
- Coût : $0.15/1M input tokens, $0.60/1M output tokens
- 6-8x moins cher que Claude Haiku pour notre usage
- Très rapide (TTFT ~350ms)
- Context window de 128K tokens (suffisant)
- Excellente performance pour extraction de données
- Support francophone natif

**Structured Outputs** :
GPT-4o-mini supporte officiellement Structured Outputs, qui garantit que l'IA suit exactement un JSON Schema.

**Exemple d'utilisation pour la capture** :
```typescript
response_format: {
  type: "json_schema",
  json_schema: {
    name: "task_extraction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        dueDate: { type: "string" }, // ISO date ou null
        dueTime: { type: "string" }, // HH:MM ou null
        priority: { type: "string", enum: ["high", "medium", "low"] }
      },
      required: ["title", "dueDate", "dueTime", "priority"],
      additionalProperties: false
    }
  }
}
```

**Contraintes Structured Outputs** :
- Tous les champs doivent être `required`
- `additionalProperties: false` obligatoire
- Racine doit être un objet (pas `anyOf`)

**⚠️ Important** :
- L'API OpenAI est **indépendante de Windsurf**
- Chaque appel engendre des coûts réels
- Nécessite une API key OpenAI payante
- Logging obligatoire pour suivre les coûts réels

**Variables d'environnement** :
```env
OPENAI_API_KEY=[openai-api-key]
```

---

### 5. Paiement : 0fee.dev (avec réserve)

**Choix** : 0fee.dev (candidat principal)

**Points confirmés** ✅ :
- **Support Togo** : Oui, via Hub2 et PaiementPro (West Africa Francophone)
- **Moyens de paiement au Togo** : Orange Money, MTN MoMo, Moov Money, Wave
- **Webhooks** : Oui, webhooks unifiés avec signature verification
- **Frais** : 0.99% par transaction, pas de frais mensuels

**Points partiellement confirmés** ⚠️ :
- **Paiements récurrents SaaS** : 0fee.dev mentionne "0cron Scheduling" pour recurring payments, mais la documentation spécifique sur les abonnements SaaS n'est pas clairement détaillée

**Points non confirmés** ❌ :
- **Détails exacts de l'implémentation des abonnements récurrents** (gestion des échecs, retry logic, etc.)
- **Conformité réglementaire spécifique au Togo pour les SaaS**

**Recommandation** :
- 0fee.dev reste le candidat principal pour le MVP
- Validation supplémentaire nécessaire sur les paiements récurrents avant engagement définitif
- Alternative de secours : Flutterwave ou PaiementPro directement si 0fee.dev ne convient pas

**Variables d'environnement** :
```env
OFEE_API_KEY=[0fee-api-key]
OFEE_WEBHOOK_SECRET=[webhook-secret]
PAID_PLAN_PRICE=9.99
```

---

### 6. Structure Backend Next.js

**Choix** : API Routes Next.js (App Router)

**Pourquoi** :
- Intégré directement dans Next.js - pas de backend séparé
- Parfait pour un MVP avec une API REST simple
- Déploiement simplifié (un seul projet)
- Scaling automatique via Vercel

**Structure** :
```
app/api/
├── auth/
│   ├── login/route.ts
│   ├── register/route.ts
│   └── logout/route.ts
├── tasks/
│   ├── route.ts
│   ├── capture/route.ts
│   ├── classify/route.ts
│   └── prioritize/route.ts
├── subscription/
│   ├── checkout/route.ts
│   └── webhook/route.ts
└── ai/
    └── usage/route.ts
```

---

### 7. Structure Frontend Next.js

**Choix** : App Router avec Server Components

**Pourquoi** :
- Architecture moderne de Next.js
- Server Components par défaut = meilleure performance
- Streaming automatique
- Intégration parfaite avec les API routes

**Structure** :
```
app/
├── layout.tsx
├── page.tsx (Landing)
├── (auth)/
│   ├── login/page.tsx
│   ├── register/page.tsx
│   └── layout.tsx
├── (app)/
│   ├── layout.tsx (protégé)
│   ├── page.tsx (Que dois-je faire maintenant)
│   ├── capture/page.tsx
│   ├── inbox/page.tsx
│   ├── backlog/page.tsx
│   └── subscription/page.tsx
└── api/ (routes)
```

---

### 8. Sécurité

**Approche** : Defense in Depth

**Mesures** :
- Clés API jamais exposées côté client
- Variables d'environnement pour tous les secrets
- Supabase RLS (Row Level Security) pour la base de données
- HTTPS obligatoire
- Input validation côté serveur
- Rate limiting sur les endpoints sensibles

**Note** : Avec Supabase Auth, pas besoin de NEXTAUTH_SECRET ou NEXTAUTH_URL.

---

### 9. Gestion des variables d'environnement

**Approche** : `.env.local` + `.env.example`

**Variables nécessaires** :
```env
# Base de données Supabase
DATABASE_URL=postgresql://postgres:[password]@db.[project-id].supabase.co:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://[project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]

# OpenAI (IA) - Coûts réels engagés
OPENAI_API_KEY=[openai-api-key]

# 0fee.dev (Paiement) - Validation abonnements requise
OFEE_API_KEY=[0fee-api-key]
OFEE_WEBHOOK_SECRET=[webhook-secret]
PAID_PLAN_PRICE=9.99

# Limites IA
FREE_PLAN_AI_LIMITS=50
PAID_PLAN_AI_LIMITS=500

# Environnement
NODE_ENV=development
```

---

## Modèle de données

### Entités minimales (v1)

**User** :
- id
- email
- password_hash (ou OAuth provider)
- plan (gratuit/payant)
- created_at

**Task** :
- id
- user_id
- title
- due_date (optionnel)
- due_time (optionnel)
- status (todo/done/overdue/archived)
- category (Important/Cette semaine/Parking/Idée)
- created_at
- source (texte brut original)

**Subscription** :
- id
- user_id
- plan
- status (active/expired/cancelled)
- renewal_date

**AIUsageLog** :
- id
- user_id
- action_type
- date
- estimated_cost

**Note** : Pas de table "Projet", "Agent" ou "Fournisseur IA" en v1.

---

## Arborescence cible du projet

```
gesia/
├── .env.example
├── .env.local
├── .gitignore
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── next.config.ts
├── eslint.config.mjs
├── postcss.config.mjs
├── tailwind.config.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── docs/
│   ├── CAHIER_DES_CHARGES.md
│   ├── PROJECT_PLAN.md
│   ├── PROGRESS.md
│   └── ARCHITECTURE.md
├── src/
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   └── server.ts
│   │   ├── openai.ts
│   │   └── ai-service.ts
│   ├── types/
│   │   ├── task.ts
│   │   ├── user.ts
│   │   └── ai-usage.ts
│   └── middleware.ts
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   ├── (auth)/
│   ├── (app)/
│   └── api/
└── components/
```

---

## Dépendances

### A. Dépendances indispensables (immédiat)
```json
{
  "dependencies": {
    "@prisma/client": "^7.10.0",
    "@supabase/supabase-js": "^2.45.0",
    "@supabase/ssr": "^0.5.0",
    "openai": "^4.67.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "prisma": "^7.10.0",
    "@prisma/adapter-pg": "^7.10.0",
    "pg": "^8.11.0",
    "typescript": "^5.0.0"
  }
}
```

### B. Dépendances utiles plus tard
```json
{
  "dependencies": {
    "date-fns": "^4.1.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0"
  }
}
```

### C. Dépendances optionnelles (tests)
```json
{
  "devDependencies": {
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@playwright/test": "^1.48.0"
  }
}
```

---

## Points de validation restants

Avant de considérer cette architecture comme définitive, les points suivants nécessitent une validation supplémentaire :

1. **0fee.dev - Abonnements récurrents SaaS** :
   - Documentation spécifique sur la gestion des abonnements récurrents
   - Retry logic en cas d'échec de paiement
   - Conformité réglementaire spécifique au Togo pour les SaaS

2. **OpenAI - Coûts réels** :
   - Estimation précise des coûts par utilisateur basée sur nos cas d'usage réels
   - Test réel pour confirmer les estimations

3. **Supabase - RLS** :
   - Configuration précise des Row Level Security pour notre modèle de données
   - Tests de sécurité

---

## Étapes de mise en place

### Phase 1 : Configuration de base
1. Configuration Supabase
2. Installation des dépendances indispensables
3. Configuration Prisma 7 avec adapter
4. Configuration Supabase Auth avec @supabase/ssr

### Phase 2 : Validation 0fee.dev
1. Vérifier spécifiquement le support des abonnements récurrents SaaS
2. Tester la sandbox pour les paiements récurrents
3. Confirmer la gestion des échecs de paiement
4. Si non conforme, évaluer alternatives

### Phase 3 : Développement des fonctionnalités
(À définir dans PROJECT_PLAN.md)

---

## Principes de développement

1. **Simplicité** : Architecture simple, maintenable
2. **Sécurité** : Secrets côté serveur uniquement
3. **Coûts** : Logging systématique des appels IA
4. **Validation** : Chaque choix technique justifié
5. **Évolutivité** : Architecture permettant l'évolution future

---

## Ressources

- [Supabase SSR Guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Prisma 7 Documentation](https://www.prisma.io/docs/orm/v7)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [0fee.dev Documentation](https://0fee.dev/docs)

---

**Historique des modifications** :
- 2026-09-10 : Version initiale, architecture validée avec réserve sur 0fee.dev
