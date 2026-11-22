# Guide Dofus

Application web qui affiche un guide Dofus dans une fenêtre flottante, toujours au premier plan, grâce à l'API **Document Picture-in-Picture** du navigateur.

## Objectif

Pendant une partie de Dofus, consulter un guide (quêtes, donjons, étapes, notes) sans quitter le jeu ni basculer entre les fenêtres. La fenêtre Picture-in-Picture reste visible par-dessus le jeu et peut contenir du HTML interactif (listes à cocher, liens, recherche).

## Contenu

L'application utilise le **Guide de Progression Optimisée de Skyzio** (onglet « Dofus 3.0 », 159 étapes du niveau 1 à 200). Le contenu appartient à son auteur : garde ce dépôt privé tant que tu n'as pas son accord pour le publier.

## Utilisation

1. Ouvre `index.html` dans Chrome ou Edge (double-clic suffit).
2. Choisis ta classe en haut à droite pour voir les conseils qui la concernent.
3. Clique sur **Ouvrir l'overlay** : une petite fenêtre reste au-dessus du jeu avec l'étape en cours.
4. Dans l'overlay, coche les succès, puis **Terminée ✓** pour passer à l'étape suivante (ou les flèches ← → du clavier).
5. Clique sur une position comme `[2,-15]` pour copier la commande `/travel 2,-15`, à coller dans le chat du jeu.

La progression est sauvegardée dans le navigateur. Thème sombre bleu nuit avec un accent doré.

## Structure

- `index.html`, `css/style.css`, `js/app.js` : l'application, sans dépendance ni compilation.
- `data/guide.js` : le guide converti depuis le fichier Excel.
- `tools/convertir_guide.py` : régénère `data/guide.js` quand le guide Excel est mis à jour :
  `python3 tools/convertir_guide.py "Guide de Progression Optimisée - Skyzio.xlsx"` (nécessite `pip install openpyxl`).

## Compatibilité

L'API Document Picture-in-Picture est disponible dans les navigateurs basés sur Chromium (Chrome, Edge, Opera) à partir de la version 116. Elle n'est pas encore prise en charge par Firefox ni Safari.

## Documentation

- [Document Picture-in-Picture API (MDN)](https://developer.mozilla.org/fr/docs/Web/API/Document_Picture-in-Picture_API)
