# uc-v2.9.0 — 2026-11-24

Undercut 2.9.0 : prise en compte dynamique de la saison, corrections de scores et règles de contrat plus équitables

## Ajouts

- Bannière d'annonce pilotée par le serveur sur le panneau Équipe, pour des annonces en temps voulu sans mise à jour de l'application
- Mise en évidence visuelle des emplacements libres dans l'alignement (accent doux, bordure en pointillés, plus entouré)
- Le remplissage automatique réinitialise désormais le compteur de pénalité d'effectif obsolète, comme un transfert manuel
- Agrégateur de statistiques admin pour un aperçu quotidien de l'utilisation
- Nouvelle tentative automatique pour les résultats de course en attente avec résolution des noms de voiture inconnus
- Tests de bout en bout des corrections de course sur l'émulateur Firestore

## Modifications

- **Rupture de compatibilité :** l'application récupère désormais la saison en cours depuis le serveur au lieu de l'année de l'appareil — une reconstruction est nécessaire pour la préparation à 2027
- La durée des contrats est désormais plafonnée par le nombre de courses restantes dans la saison et par des périodes de six courses par pilote
- Les corrections de résultats post-course re-notent toutes les équipes concernées dans un délai de 72 heures
- Les ventes à expiration s'exécutent désormais aux prix post-course, et non pré-course
- Le passage à la nouvelle saison archive désormais 2026, réinitialise les équipes et les classements, et définit les prix et le calendrier de 2027
- La vente du Pit Wall Pass pour la prochaine saison est désormais disponible dès décembre (disponibilité hors saison)
- Les comptes de test des stores sont désormais exclus des statistiques admin

## Corrections

- Remboursement des pénalités d'effectif obsolète pour les équipes remplies automatiquement à Las Vegas 2026
- Compatibilité iOS 15.1+ (prise en charge de Xcode 27, protection expo-router pour iOS 16)
- Les corrections de course et les réparations d'expiration s'écrivent désormais de manière atomique avec set+mergeFields
- La réparation des ventes à expiration empêche le budget de passer sous zéro
- Le passage à la nouvelle saison réinitialise les équipes avec un enchaînement des prix correct
- Audit de sécurité des dépendances ; suppression de la dérogation GHSA générale

## Sécurité

- Règles de lecture Firestore réservées aux admins pour les statistiques agrégées
- Correction des vulnérabilités des dépendances
