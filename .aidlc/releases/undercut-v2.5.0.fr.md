# uc-v2.5.0 — 2026-10-07

Prédictions Moonshot, modification du nom d'équipe et améliorations du chronométrage en direct dans Undercut 2.5.0.

## Ajouté

- **Moonshot** : à partir de la manche 13, une équipe en retard dans sa ligue peut faire un call sur un pilote pour la prochaine course — victoire, podium, points ou battre un rival — en engageant une partie de ses points de saison ou de son budget d'effectif. Un call réussi ajoute la récompense au total de la saison ; un call manqué coûte la mise. Disponible dans les vues équipe et ligue, avec un guide à la première utilisation.
- Ingestion des données de chronométrage en direct le jour de la course, réparties sur Firestore pour des mises à jour en temps réel.
- Possibilité de renommer votre équipe et le nom affiché de votre manager depuis le portail Pit Wall ; les modifications se synchronisent sur tous vos appareils.
- Police Archivo dans l'application, assortie au portail web Pit Wall.

## Modifié

- La synchronisation des métadonnées d'équipe est désormais plus intelligente : seules les modifications locales de votre appareil sont envoyées vers Firestore, ce qui évite les retours en arrière dus à des modifications faites ailleurs.
- L'heure de verrouillage de la composition affichée dans l'application correspond désormais à l'heure de verrouillage appliquée par le serveur.

## Corrigé

- Renforcement de la sécurité appliqué avant la sortie de la version 2.5.0.
- La création d'une ligue n'accorde plus les fonctionnalités payantes sans licence appropriée.
- Les identifiants de ligue d'équipe sont désormais validés comme des identifiants de document Firestore utilisables.
- La synchronisation des métadonnées n'écrase plus les copies serveur plus récentes lors des mises à jour périodiques.
