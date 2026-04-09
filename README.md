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

Go server:

- Start: `cd gltf && go run .`
- Health check: `http://localhost:8080/health`
- Admin API: `http://localhost:8080/api/admin/models`

## Cloud Deployment

The Go server can now host the built frontend as well as the runtime `gltf/` and `pdf/` assets.

1. Build the frontend: `cd frontend && npm run build`
2. Start the Go server: `cd gltf && go run .`
3. Open `http://localhost:8080/`
4. Open `http://localhost:8080/#/admin` for model and video management

External media links for the public page are managed in `data/site-content.json` through the admin UI and currently support normalized YouTube and Bilibili URLs.

## Project Structure

- `frontend/`: Vite app, UI, and Three.js scene
- `gltf/`: source boat models and textures
- `pdf/`: brochure and cover assets
- `.github/workflows/deploy-pages.yml`: GitHub Pages deployment workflow
