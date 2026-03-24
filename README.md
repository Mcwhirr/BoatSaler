# BoatSaler

Interactive boat showcase built with Vite, React, Three.js, and GSAP.

## Live Demo

GitHub Pages: https://mcwhirr.github.io/BoatSaler/

## Local Development

Frontend app:

- Install: `cd frontend && npm install`
- Start dev server: `npm run dev`
- Build: `npm run build`
- Preview production build: `npm run preview`

The frontend syncs source assets from the repository `gltf/` directory into `frontend/public/gltf/` during `predev` and `prebuild`.

## Project Structure

- `frontend/`: Vite app, UI, and Three.js scene
- `gltf/`: source boat models and textures
- `pdf/`: brochure and cover assets
- `.github/workflows/deploy-pages.yml`: GitHub Pages deployment workflow
