# Workspace Boundaries

## Goal

This repository stays as a single npm package, while enforcing clear module ownership similar to a lightweight monorepo.

## Runtime Ownership

- `src/core/**`: pure battle engine and shared runtime schemas.
- `src/server/**`: WebSocket/Express runtime, room state, handlers, AI scheduling.
- `src/client/**`: browser pages, render layer, and interaction modules.
- `src/content/entities/**`: gameplay content definitions (characters, aurora dice, weather).
- `tools/**`: local tooling for audits, tests, and release workflows.

## Compatibility Layers

- `server/**` must remain compatibility shims only (`module.exports = require(...)`).
- `src/content/{dice,registry,rooms,skills,weather}.js` keep legacy re-export behavior for old imports.

## Boundary Gates

- `npm run audit:paths`: runtime source-of-truth path checks.
- `npm run audit:boundaries`: compatibility shims, public-assets-only, weather single-source checks.
- CI runs both audits on every push/PR.

## Public Folder Rule

- `public/` is for static assets only.
- Runtime HTML/CSS/JS entry files belong in `src/client/`.

## Why This Helps

- Reduces accidental cross-layer coupling.
- Keeps migration cost low while preserving single-package simplicity.
- Makes future workspace/package split straightforward if team size increases.
