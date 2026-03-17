# AGENTS.md

This document defines how coding agents should work in this repository.

## 1) Project Snapshot

- Stack: Vite + Three.js + GSAP
- Entry HTML: `index.html`
- React entry script: `src/main.jsx`
- Main 3D scene component: `src/ShipScene.jsx`
- Global styles: `src/style.css`
- Static assets: `public/` (synced assets and manifest are generated under `/gltf/`)

## 2) Runbook

- Install dependencies: `npm install`
- Start development server: `npm run dev`
- Build production bundle: `npm run build`
- Preview production build: `npm run preview`

## 3) Code Ownership Map

- `src/App.jsx`
  - Page composition, scene controls, UV set selection.
- `src/ShipScene.jsx`
  - Scene setup, lights, camera, controls, renderer, animation loop, model loading.
- `src/style.css`
  - Global reset and canvas positioning.
- `index.html`
  - Hosts React root and loads `src/main.jsx`.

## 4) Agent Working Rules

1. Keep changes minimal and local.
2. Preserve the current runtime architecture unless task explicitly asks for refactor.
3. Avoid adding new dependencies unless strictly needed.
4. Keep runtime asset loading aligned with `/gltf/asset-manifest.json` unless the task requires asset pipeline changes.
5. Prefer small, readable functions when adding logic to `src/main.js`.
6. Keep rendering loop (`tick`) single-responsibility: update state -> controls -> render -> next frame.
7. Keep mobile/desktop behavior stable when changing canvas, camera, or resize logic.
8. If introducing debug logs, remove them before finalizing unless requested.

## 5) Three.js Specific Conventions

- Always update camera projection matrix after aspect ratio changes.
- Always update renderer size and pixel ratio inside resize handling.
- Use `OrbitControls` damping consistently with `controls.update()` each frame.
- Add new scene objects with explicit lifecycle notes if they allocate GPU resources.
- If removing meshes/materials/textures dynamically, dispose GPU resources properly.

## 6) Style and Formatting

- Follow existing JavaScript style in the file being edited.
- Do not reformat unrelated blocks.
- Keep comments concise and meaningful.
- Use English for code comments and commit-ready documentation.

## 7) Validation Checklist (Before Finish)

- `npm run build` completes successfully.
- Development scene renders without runtime errors.
- Resize behavior still works.
- Fullscreen toggle still works.
- Any added feature does not break model loading.
- UV set switching still applies the selected texture group.

## 8) Common Safe Improvements (Allowed Without Large Refactor)

- Remove duplicate or dead code blocks.
- Replace noisy `console.log` with guarded debug utility.
- Extract repeated setup logic into small helper functions.
- Improve error handling around GLTF loading.

## 9) Things to Avoid

- Migrating project structure unless explicitly requested.
- Renaming public asset paths casually.
- Introducing unrelated UI frameworks.
- Changing build tooling from Vite.

## 10) Task Handoff Notes

When finishing a task, report:

1. Files changed.
2. Behavior impact.
3. Validation performed.
4. Follow-up risks or suggestions.
