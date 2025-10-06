
# TwinDigiTal

> Visualisation 3D interactive d'une ville avec Vue 3, Vite et Three.js

## Présentation

TwinDigiTal est une application web permettant de visualiser et d'explorer une scène 3D de type "digital twin" (jumeau numérique) d'une ville. Elle utilise Vue 3 pour l'interface, Vite pour le bundling, et Three.js pour le rendu 3D. Le modèle 3D est chargé au format GLTF.

## Fonctionnalités principales

- Affichage d'une scène 3D interactive (modèle GLTF)
- Navigation FPS au clavier (flèches pour avancer/reculer et tourner)
- Lumières dynamiques, grille au sol, helpers visuels
- Responsive : s'adapte à la taille de la fenêtre

## Structure du projet

- `src/components/CityViewer.vue` : composant principal de visualisation 3D
- `public/models/scene.gltf` : modèle 3D de la ville
- `src/App.vue` : point d'entrée de l'application Vue
- `vite.config.js` : configuration Vite

## Prérequis

- Node.js 20.19+ (ou 22.12+)
- npm

## Installation

```bash
npm install
```

## Lancement du serveur de développement

```bash
npm run dev
```

Ouvrez ensuite l'URL indiquée dans le terminal (généralement http://localhost:5173).

## Déploiement sur GitHub Pages

```bash
npm run deploy
```

## Crédits

- [Vue.js](https://vuejs.org/)
- [Vite](https://vitejs.dev/)
- [Three.js](https://threejs.org/)
- Modèle 3D : voir `public/models/license.txt`

---
© 2025 Ephraim1110
