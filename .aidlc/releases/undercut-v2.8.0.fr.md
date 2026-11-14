# uc-v2.8.0 — 2026-11-14

Undercut 2.8.0 : Pit Wall planifie le reste de ton équipe à partir de tes premiers choix et propose ton as quand tu confirmes, avec les corrections du dernier test : un pilote que tu peux payer n'est jamais bloqué, chaque pilote du marché ouvre ses détails et les noms d'équipe passent en premier.

## Nouveautés

- **Stratégies Pit Wall.** Les premiers pilotes que tu ajoutes indiquent à Pit Wall comment tu construis : un pilote du tiers le plus cher donne STARS, uniquement des pilotes bon marché donne VALUE, tout le reste BALANCED. Un bandeau PIT WALL STRATEGY dans l'onglet pilotes te permet de changer, et les pilotes de son plan pour tes places libres portent PIT WALL PLAN, dans ton budget après le constructeur le moins cher.
- **L'as à la confirmation.** Enregistrer une équipe complète ouvre la proposition d'as de Pit Wall dès que tu reviens sur ton équipe.

## Modifications

- **Le nom d'équipe d'abord.** Le nom de ton équipe s'affiche en grand, celui du joueur en petit dessous, sur le Grid, dans les ligues et dans le bilan de la manche. Le fil Moonshot de la ligue tient en une ligne : MOONSHOT +N POINTS · TEAM.
- **Les numéros de voiture** sont plus grands, en gras et aux couleurs de l'équipe sur les tuiles d'équipe et de ligue.
- **Pit Wall passe à l'or.** Sa bande de choix, la proposition d'as, l'analyse et les lignes du Pass sont dorées au lieu de rouges , et les avertissements de Pit Wall sont orange.
- **Une équipe retenue dit quand elle rouvre.** Après une course, l'en-tête affiche RESULTS PENDING, REOPENS IN … ou REOPENING SOON au lieu d'un compte à rebours au-dessus de lignes bloquées, et ton équipe est relue quand tu y reviens.

## Corrections

- **Un pilote abordable impossible à acheter.** La 2.7.2 bloquait tout pilote qui laissait trop peu pour la fin d'équipe la moins chère : avec $18 en banque, impossible d'acheter un pilote à $5. Un pilote que tu peux payer s'achète désormais toujours ; celui qui laisse trop peu est signalé TIGHT · LEAVES TOO LITTLE FOR THE REST.
- **Détails du marché hors du mode édition.** Toucher une ligne bloquée ou indisponible ouvre une fiche de détails en lecture seule, et un appui long l'ouvre sur n'importe quelle ligne.
- **« JR » comme nom de famille.** Les noms avec Jr., Sr. ou un chiffre romain affichent le vrai nom de famille.
- **Hirakawa et Câmara par leur nom.** Les voitures 50 et 51 affichent le nom de leur pilote dans le chrono en direct et les vues de course depuis le changement de baquet chez Haas.
