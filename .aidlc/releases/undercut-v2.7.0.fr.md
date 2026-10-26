# uc-v2.7.0 — 2026-10-26

Undercut 2.7.0 : le marché reste ouvert pendant que votre équipe est verrouillée, votre Moonshot figure dans le récap du week-end, le compteur de Moonshots compte au verrouillage, et le conseil d'as de Pit Wall ouvre la fiche pilote. Côté serveur, les résultats arrivent désormais à l'heure parce que le flux de chronométrage est lu avec la clé payante (aucune nouvelle version n'est nécessaire pour cela).

## Ajouté

- **Marché pendant le verrouillage.** MARKET sur la ligne de l'équipe ouvre le sélecteur en marché en lecture seule pendant tout le week-end de course : prix, points et projections, rien à toucher. La barre d'enregistrement affiche LOCKED · AUTO-FILL ON.
- **Moonshot dans le récap du week-end.** Une carte entre les points du week-end et les marqueurs montre votre pari, l'arrivée du pilote et les points, et une ligne additionne équipe et Moonshot dans le total du week-end. Une mise en cash est nommée comme telle ; un pari annulé indique que le jeton est revenu.
- **Score en direct le jour de la course, désactivé.** Le code d'un LIVE +N sur chaque tuile et d'une statistique LIVE · SO FAR pendant la course est dans cette version, mais rien ne s'affiche tant que l'interrupteur du chronométrage en direct n'est pas activé, après la confirmation écrite du fournisseur de chronométrage.

## Modifié

- **Compteur de Moonshots.** Un jeton compte comme dépensé quand son pari se verrouille, pas quand vous le placez, puisqu'un pari ouvert peut encore être annulé avec remboursement intégral : ONE IN PLAY · COUNTS WHEN SELECTIONS LOCK, puis ONE USED THIS WEEKEND.
- **Le conseil d'as en premier.** L'ACE CALL de Pit Wall est le premier bloc de la fiche pilote, sous le nom et l'équipe du pilote ; quand le conseil est de prendre ce pilote comme as, MAKE ACE · 2× POINTS s'y trouve directement et le bouton du bas disparaît.
