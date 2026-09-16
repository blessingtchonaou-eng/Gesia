# Cahier des charges — MVP
## Assistant intelligent de gestion de tâches

---

## 1. Contexte et vision

Ce document définit le périmètre de la **v1 (MVP)** uniquement. La vision long terme (multi-IA, BYOK, orchestration d'agents) existe et guide les choix d'architecture, mais **ne fait pas partie du développement immédiat**.

**Promesse centrale du produit :**
> L'utilisateur dit ce qu'il doit faire. Le système comprend, organise et priorise — sans que l'utilisateur ait à gérer son outil de gestion de tâches.

**Slogan de référence :** *"Moins gérer ses tâches. Plus les accomplir."*

---

## 2. Problème résolu

Les gestionnaires de tâches classiques échouent pour 5 raisons principales :

1. Saisie trop lente / trop de champs à remplir.
2. Backlog qui s'accumule et devient source de culpabilité.
3. Trop de fonctionnalités → l'outil devient un travail en soi.
4. Notifications ignorées à force d'être inutiles.
5. Aucune aide pour savoir "quoi faire maintenant" parmi 30 tâches.

Le MVP doit prouver qu'on peut résoudre au moins les points 1, 2 et 5 — les plus critiques pour convaincre un premier utilisateur.

---

## 3. Utilisateur cible (persona MVP)

- Étudiant, freelance ou jeune professionnel avec une charge de travail variable.
- Frustré par les outils existants (Todoist, Notion, etc.) jugés trop rigides ou trop chronophages à maintenir.
- Utilise principalement le web/mobile, dans un contexte francophone dans un premier temps.

---

## 4. Périmètre du MVP — Fonctionnalités incluses

### 4.1 Capture rapide
- Un champ de saisie en langage naturel ("Je dois envoyer le rapport vendredi à 15h").
- L'IA extrait automatiquement : intitulé, date/heure si présente, priorité implicite.
- Aucun champ obligatoire à remplir manuellement.

### 4.2 Inbox + tri automatique
- Toute capture arrive dans une Inbox.
- L'IA propose un classement (Important / Cette semaine / Parking / Idée).
- L'utilisateur valide ou corrige — jamais de tri imposé sans validation.

### 4.3 "Que dois-je faire maintenant ?"
- Vue centrale de l'application.
- Sélectionne 2-3 tâches pertinentes selon : échéance, priorité déclarée, durée estimée.
- Pas de disponibilité calendrier ni de contexte (téléphone/ordinateur) en v1 — trop complexe pour le MVP.

### 4.4 Système anti-backlog (version simple)
- Une tâche en retard n'est pas affichée comme "échec" mais comme décision à prendre :
  Faire aujourd'hui / Reporter / Archiver / Supprimer.
- Pas de "Reset" intelligent complet en v1 (juste une liste filtrable des tâches en retard).

### 4.5 Compte utilisateur + abonnement
- Authentification simple (email/mot de passe ou OAuth).
- Un plan gratuit limité (durée ou volume d'actions IA) + un plan payant.
- Paiement récurrent mensuel.

---

## 5. Hors périmètre (explicitement exclu de la v1)

À ne **pas** développer avant validation du MVP :

- BYOK (clé API personnelle de l'utilisateur).
- AI Router / choix automatique de modèle.
- Système d'agents spécialisés / agents externes connectables.
- Contexte (téléphone, ordinateur, maison...).
- Décomposition automatique de projets complexes avec dépendances.
- Mode Focus avec minuteur.
- Revue hebdomadaire automatisée.
- Notifications intelligentes contextuelles.
- Intégrations calendrier, email, Slack.

Ces éléments restent dans la vision produit et pourront être réintroduits une fois le cœur validé par de vrais utilisateurs.

---

## 6. Principes produit à respecter pendant tout le développement

1. **Capture sans friction** — jamais plus de 2 secondes pour ajouter une tâche.
2. **L'IA fait le travail administratif** — pas de tri manuel obligatoire.
3. **Aujourd'hui plutôt que tout** — l'écran principal ne montre jamais toute la base de tâches.
4. **Zéro culpabilisation** — un retard devient une décision, jamais un échec affiché.
5. **Plus de fonctionnalités ≠ meilleur produit** — toute nouvelle fonctionnalité doit être justifiée par la promesse centrale, pas ajoutée "parce que ce serait bien".

---

## 7. Architecture technique proposée (MVP)

*Stack indicative — à confirmer/ajuster en Phase 2 (Architecture) du développement.*

- **Frontend** : Next.js (cohérent avec l'expérience déjà acquise sur le projet Capture Média).
- **Backend** : API routes Next.js ou backend séparé léger (à trancher selon complexité anticipée).
- **Base de données** : PostgreSQL (via un service géré type Supabase/Neon pour limiter la charge d'administration en solo).
- **Authentification** : solution clé en main (ex. Auth.js, Clerk, ou équivalent) plutôt que développée maison.
- **IA** : un seul fournisseur en v1 (à choisir), appelé côté serveur uniquement — jamais de clé API exposée côté client.
- **Paiement/abonnement** : à choisir en tenant compte de la disponibilité par pays (voir section 9 — point à vérifier avant de s'engager, la disponibilité de Stripe et d'alternatives varie selon les pays et évolue dans le temps).

---

## 8. Modèle de données simplifié (v1)

Entités minimales nécessaires :

- **User** : id, email, mot de passe/OAuth, plan (gratuit/payant), date de création.
- **Task** : id, user_id, titre, date/heure (optionnel), statut (à faire / fait / en retard / archivé), catégorie (Important / Cette semaine / Parking / Idée), créée le, source (texte brut original).
- **Subscription** : id, user_id, plan, statut (actif/expiré/annulé), date de renouvellement.
- **AIUsageLog** (pour suivre le coût) : id, user_id, type d'action, date, coût estimé.

Pas de table "Projet", "Agent" ou "Fournisseur IA" en v1 — inutile tant que le multi-IA n'est pas développé.

---

## 9. Système d'abonnement — points à trancher avant développement

- Nombre de plans (ex. Gratuit limité + Payant unique, ou Gratuit + 2 paliers payants).
- Limite précise du plan gratuit (durée d'essai vs volume d'actions IA — à choisir, cf. discussion sur le risque de coût des utilisateurs non convertis).
- Prix du plan payant (à fixer une fois le coût IA par utilisateur mieux connu à l'usage réel).
- **Solution de paiement à vérifier en priorité** : la disponibilité et les conditions de Stripe (ou d'alternatives comme Paddle, LemonSqueezy, Flutterwave) pour un compte basé au Togo doivent être confirmées avant de choisir — cette contrainte géographique peut orienter le choix technique plus que les fonctionnalités elles-mêmes.

---

## 10. Contraintes de coût IA

- Utiliser un modèle économique/rapide pour la capture et le tri (actions fréquentes).
- Fixer une limite d'actions IA par mois et par utilisateur, y compris sur le plan payant, pour garder un coût prévisible.
- Journaliser chaque appel IA (AIUsageLog) dès le départ pour mesurer le coût réel par utilisateur actif et ajuster le pricing en conséquence.

---

## 11. Critères de succès du MVP

Le MVP est considéré validé si, après une période de test avec un petit groupe d'utilisateurs réels (hors amis proches) :

- La capture en langage naturel est jugée fiable (peu de corrections manuelles nécessaires).
- Les utilisateurs reviennent utiliser l'app plusieurs fois par semaine sans y être poussés.
- Au moins une partie des utilisateurs en essai gratuit convertit vers le plan payant.
- Le coût IA réel par utilisateur actif reste cohérent avec les estimations (~0,50-1 $/mois).

---

## 12. Phases de développement (alignées sur les directives de travail)

1. **Analyse** — confirmer ce cahier des charges, lever les points ouverts (section 9).
2. **Architecture** — choix définitifs stack, base de données, authentification, paiement.
3. **Développement** — étape par étape, fonctionnalité par fonctionnalité (section 4), en suivant le protocole défini dans les directives de travail IA.
4. **Tests** — fonctionnels, erreurs, sécurité, utilisateur, pour chaque fonctionnalité livrée.
5. **Optimisation** — performance, UX, sécurité, une fois le parcours complet fonctionnel.
6. **Déploiement** — variables d'environnement, hébergement, monitoring, avant ouverture à de vrais utilisateurs.

---

## 13. Suivi de progression

*(à tenir à jour au fil du développement, selon le format demandé dans les directives de travail)*

### TERMINÉ
- [ ] —

### EN COURS
- [ ] —

### À FAIRE
- [ ] Capture rapide
- [ ] Inbox + tri automatique
- [ ] "Que dois-je faire maintenant"
- [ ] Système anti-backlog simple
- [ ] Compte utilisateur + abonnement