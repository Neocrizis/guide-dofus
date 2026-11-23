# Guide Dofus Overlay (appli Windows)

Petite appli [Tauri](https://tauri.app) qui affiche le journal du Guide Dofus (`https://neocrizis.github.io/guide-dofus/?mode=overlay`)
dans une fenêtre sans cadre, transparente et toujours au-dessus du jeu.

- **Ctrl+Maj+G** : afficher / masquer le journal
- **Ctrl+Maj+T** : clic au travers (la souris passe à travers pour jouer dessous)
- Icône dans la zone de notification : mêmes réglages, « Toujours au premier plan », « Recharger », « Quitter »
- La barre « Journal de quêtes » sert à déplacer la fenêtre ; les bords à la redimensionner ; le curseur ◐ règle la transparence.
- Connexion au compte (👤) : se fait dans le navigateur du PC, qui renvoie vers l'appli par le lien `guidedofus://auth`
  (à ajouter dans Supabase > Authentication > URL Configuration > Redirect URLs).

L'installateur est construit par GitHub Actions (`.github/workflows/appli-windows.yml`) et publié dans les Releases.
Pour une nouvelle version : augmenter `version` dans `src-tauri/tauri.conf.json`.
