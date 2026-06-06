# Carnet de bord ESB

Mini-application indépendante pour les mémos d'Antoni, Vincent et Laurence : bugs appli, idées, modifications, matériel, organisation et retours terrain.

## Champs gardés

- Auteur : Antoni, Vincent ou Laurence.
- Note.
- Catégorie, avec suggestions mais saisie libre possible.
- Priorité.
- Statut simple : `Nouveau`, `À voir`, `En cours`, `Fait`, `Archivé`.
- Échéance.
- Réponse / suivi.

Les champs destinataire, assigné à, visibilité, historique de lecture et prise en charge ont été retirés pour garder un vrai carnet simple.

## Google Sheet

Le script `apps-script/Code.gs` crée ou utilise le fichier `CARNET_BORD_ESB` avec les onglets :

- `NOTES`
- `LECTURES`
- `UTILISATEURS`
- `PARAMETRES`
- `ARCHIVES`

Seul `NOTES` est utilisé au quotidien. Les autres onglets restent disponibles pour compatibilité et évolutions.

## Mise en service

1. Utiliser un compte ou un espace géré par le club, pas les accès personnels de Laurence.
2. Créer un projet Google Apps Script.
3. Coller le contenu de `apps-script/Code.gs`.
4. Renseigner `CLUB_CARNET_FOLDER_ID` avec l'identifiant du dossier Drive commun `Hub Club / Carnet de bord`.
5. Exécuter une première fois `doGet`.
6. Déployer le script en Web App.
7. Copier l'URL du Web App dans `app.js`, champ `APP_CONFIG.appsScriptUrl`.
8. Renseigner dans `UTILISATEURS` les emails Google autorisés pour Antoni, Vincent et Laurence.

## Hub

Le hub principal doit seulement ouvrir cette application via le bouton de `hub-button-snippet.html`.
