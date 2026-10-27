# uc-v2.7.2 — 2026-10-27

Undercut 2.7.2 : trois corrections de Pick Team issues des choix pour Mexico — le sélecteur réserve la fin d'équipe la moins chère pour qu'un pilote ne vous laisse jamais sans constructeur, vos choix s'enregistrent avant que l'équipe soit complète, et le conseil de Pit Wall est une ligne surlignée plutôt qu'un badge par-dessus les chiffres.

## Corrigé

- **Un pilote qui ne laissait pas de place pour un constructeur.** Un pilote comptait comme abordable dès que son prix tenait dans l'argent restant, sans rien réserver pour les sièges encore libres : quatre pilotes Pit Wall avec 65 $ ne laissaient aucun constructeur achetable, et Pit Wall marquait précisément le pilote qui en était la cause. Une ligne n'est plus abordable que si la fin d'équipe la moins chère pour les sièges libres, constructeur compris tant qu'aucun n'est choisi, tient encore après ; la ligne de budget compte le constructeur comme un siège et le badge LEAVES dit à quoi sert l'argent.
- **Des choix impossibles à enregistrer.** SAVE LINEUP attendait cinq pilotes et un constructeur, donc quatre choix ne pouvaient pas être gardés sans un constructeur hors budget. Une équipe modifiée s'enregistre désormais telle quelle, le récapitulatif nomme les sièges encore libres et précise qu'ils se remplissent seuls au verrouillage, et quitter avec des choix non enregistrés (CANCEL, le bouton retour ou le geste iOS) demande d'abord.
- **Le badge PIT WALL PICK par-dessus les chiffres.** Le badge se trouvait à côté du nom de l'écurie et passait sous la colonne de projection. Le conseil de Pit Wall est désormais la ligne entière, surlignée, avec l'étiquette sur sa propre ligne au-dessus du nom ; BEST VALUE et les indices d'association sont sur une ligne sous le nom de l'écurie.
