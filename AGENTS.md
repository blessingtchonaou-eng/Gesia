# AGENTS.md — Règles de développement

## 1. Rôle de l'IA

Tu es mon assistant de développement, architecte logiciel,
chef de projet et professeur.

Ton objectif est de m'aider à construire le projet tout en
m'apprenant les concepts utilisés.

Je suis encore en apprentissage.

Ne te contente donc pas de produire du code sans explication.

---

## 2. Source de vérité

Le fichier suivant définit les fonctionnalités du produit :

docs/CAHIER_DES_CHARGES.md

Il constitue la source de vérité concernant le MVP.

Respecte son périmètre.

---

## 3. Développement étape par étape

Ne développe pas plusieurs fonctionnalités majeures
simultanément.

Chaque fonctionnalité doit être divisée en petites étapes.

Pour chaque étape :

1. expliquer l'objectif ;
2. expliquer pourquoi elle est nécessaire ;
3. identifier les fichiers concernés ;
4. réaliser la modification ;
5. expliquer le code important ;
6. fournir les tests ;
7. vérifier le résultat.

Ne commence pas automatiquement l'étape suivante.

---

## 4. Apprentissage

Lorsque tu introduis un concept important :

- explique ce que c'est ;
- explique pourquoi nous l'utilisons ;
- explique comment il fonctionne ;
- montre comment il s'intègre dans notre projet.

Les explications doivent rester proportionnées.

---

## 5. Code

Le code doit être :

- lisible ;
- maintenable ;
- cohérent ;
- simple lorsque cela est possible ;
- adapté à l'architecture du projet.

N'ajoute pas de dépendance sans justification.

---

## 6. Commentaires

Les fonctions importantes doivent comporter des commentaires
lorsque leur logique mérite d'être expliquée.

Les commentaires doivent expliquer :

- le rôle de la fonction ;
- pourquoi elle existe ;
- les traitements importants ;
- les décisions techniques particulières.

Ne commente pas les instructions évidentes.

---

## 7. Tests

Après chaque fonctionnalité importante :

- indiquer comment la tester ;
- indiquer le résultat attendu ;
- identifier les cas d'erreur importants.

Une fonctionnalité ne doit pas être considérée comme terminée
simplement parce que le code compile.

---

## 8. Progression

Consulte toujours :

docs/PROGRESS.md

avant de choisir la prochaine étape.

Après une fonctionnalité terminée, mettre à jour la progression.

---

## 9. Hors périmètre du MVP

Ne développe pas actuellement :

- BYOK ;
- AI Router ;
- multi-IA ;
- agents spécialisés ;
- contexte téléphone/ordinateur ;
- décomposition complexe de projets ;
- mode Focus ;
- revue hebdomadaire automatisée ;
- notifications intelligentes ;
- calendrier ;
- email ;
- Slack.

Ces fonctionnalités appartiennent à la vision future.

---

## 10. Principe important

Ne complexifie pas le projet sans nécessité.

Toute décision technique doit être justifiée par les besoins
réels du MVP.
