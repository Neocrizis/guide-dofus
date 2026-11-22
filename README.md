# Guide Dofus

Application web qui affiche un guide Dofus dans une fenêtre flottante, toujours au premier plan, grâce à l'API **Document Picture-in-Picture** du navigateur.

## Objectif

Pendant une partie de Dofus, consulter un guide (quêtes, donjons, étapes, notes) sans quitter le jeu ni basculer entre les fenêtres. La fenêtre Picture-in-Picture reste visible par-dessus le jeu et peut contenir du HTML interactif (listes à cocher, liens, recherche).

## Fonctionnement prévu

- Une page principale pour choisir ou écrire un guide.
- Un bouton « Ouvrir en overlay » qui ouvre la fenêtre via `documentPictureInPicture.requestWindow()`.
- Dans l'overlay : les étapes du guide, une progression cochable et une navigation étape par étape.
- La progression est sauvegardée localement dans le navigateur.

## Compatibilité

L'API Document Picture-in-Picture est disponible dans les navigateurs basés sur Chromium (Chrome, Edge, Opera) à partir de la version 116. Elle n'est pas encore prise en charge par Firefox ni Safari.

## Documentation

- [Document Picture-in-Picture API (MDN)](https://developer.mozilla.org/fr/docs/Web/API/Document_Picture-in-Picture_API)
