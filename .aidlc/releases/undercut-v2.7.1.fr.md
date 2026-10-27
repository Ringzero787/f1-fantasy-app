# uc-v2.7.1 — 2026-10-27

Undercut 2.7.1 : corrige le plantage au lancement de la 2.7.0, fait raconter au récap du week-end votre week-end tel qu'il a été noté, un récap par équipe, et garde Moonshot actif après une nouvelle connexion.

## Corrigé

- **Plantage au lancement en 2.7.0.** La 2.7.0 a été construite sans sa configuration web Firebase et s'arrêtait sur l'écran de démarrage sur toutes les plateformes. La 2.7.1 reprend les mêmes fonctionnalités, construites correctement, et les scripts de build refusent désormais de produire un bundle sans cette configuration.
- **Moonshot désactivé après la connexion.** L'application lisait sa configuration une fois au démarrage, parfois avant la restauration de la session, et gardait les valeurs par défaut toute la session : le compteur de Moonshots, la carte Moonshot du récap et la ligne du prochain tour restaient cachés jusqu'à un redémarrage à froid. La configuration est maintenant relue dès que la connexion est connue.

## Modifié

- **Récap du week-end d'après le relevé.** Le récap montre désormais vos points tels que le serveur les a notés, pilote par pilote, avec ACE ×2, TEAM et AUTO signalés et les choix à 0 point sur une seule ligne ; FIELDED n OF 6 quand des places étaient vides ; votre place dans le tour avec l'écart au vainqueur et votre rang de saison avec son évolution ; votre Moonshot réglé avec le total du week-end ; et le prochain tour avec son verrouillage et votre Moonshot dessus. La carte nomme l'équipe, et un joueur avec deux équipes reçoit un récap par équipe.
