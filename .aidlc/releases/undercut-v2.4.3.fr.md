# uc-v2.4.3 — 2026-10-04

Undercut 2.4.3 : comptes unifiés, sécurité des achats et fonctionnalités premium de Pit Wall.

## Ajouté

- Connexion multi-boutiques : votre compte fonctionne que vous ayez installé l'app depuis Google Play, l'App Store ou Amazon Appstore
- Partagez le classement de votre ligue et votre équipe directement depuis l'app
- Les droits du Pit Wall Pass sont désormais révoqués en cas de remboursement par la boutique
- Détail du pilote dans l'app montrant ce que votre pass a débloqué
- Refonte du Pit Wall Briefing avec section vedette, bandeau d'annonces et variations de prix

## Modifié

- Le verrou Ace se base désormais sur le calendrier serveur plutôt que sur celui intégré à l'app
- Les projections Pit Wall incluent plancher, médiane, plafond, risque d'abandon et estimations de prix à venir
- Le Pit Wall Pass (14,99 $/saison) est désormais le seul produit premium ; League Pro découle de la possession du pass

## Corrigé

- **Sécurité** : des jetons Play Store falsifiés ne permettent plus d'acheter des packs ou des pass à des prix incorrects
- **Sécurité** : suppression de la clé API de production de secours ; plus de rétrogradation silencieuse en cas d'erreur de configuration
- La fenêtre Ace se fige désormais pour chaque session qu'elle note, pas seulement les courses
- La connexion est désormais verrouillée sur l'appareil qui l'a initiée
- Les achats ne sont désormais validés qu'une seule fois par transaction, et non à chaque lancement de l'app
- Les attributions de pass fonctionnent correctement après une révocation
- Les achats bloqués dans la file d'attente de la boutique se finalisent désormais correctement
- Correction du mappage des manches ; Bahreïn rétabli à Sépang en tant que manche 18
- Neuf scripts opérationnels ne plantent plus silencieusement à l'import
- Le champ SHARE de l'équipe est désormais lu comme un contrôle, et non comme une légende
- Import du seeder interrompu ; le calendrier est désormais correct
- La version iOS ne propose plus l'option Amazon Appstore

## Sécurité

- Verrou Ace déplacé côté serveur ; suppression de l'implémentation propre à l'app
- Secrets partagés Amazon et Apple migrés vers Secret Manager
- Les identifiants de reçus Amazon utilisent désormais leur propre format, distinct de celui du Play Store
- Résolution des alertes de dépendances à sévérité élevée
- Toutes les protections et failles à l'import sont désormais corrigées
