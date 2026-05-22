# Repository Guidelines

## First Context Rule

Read `PROJECT_CONTEXT.md` before broad exploration. It is the compact source of stable project facts. Use the Obsidian vault only for the specific area being changed: `/home/mihail/Документы/Obsidian Vault/Проекты/Kofeyny`.

## Project Structure

- `src/` contains the Vue 3 + Vite + Tailwind PWA.
- `src/components/` contains feature screens and reusable UI.
- `server/` contains the native Node.js HTTP API, auth, PostgreSQL access, audit, and push notifications.
- `public/` contains PWA assets and `app-version.json`.
- `scripts/update-production.sh` is the production update script.

## Commands

- `npm run dev:all` starts local API and frontend.
- `npm run build` verifies and builds the frontend.
- `npm run start` runs the production-style app locally after build.

## Style

Use ES modules, two-space indentation, single quotes, semicolon-free JavaScript, and Vue `<script setup>`. Name Vue components in PascalCase and functions/variables in camelCase.

## Maintainability

Keep files focused. Target 200 lines when practical. If a file grows past about 400 lines, split by responsibility during the next related change. Avoid reading or rewriting huge files when `rg` can locate the exact function, component, or route.

## Context Economy

Do not inspect deploy/build logs unless something fails. Prefer `rg`, narrow `sed` ranges, and small diffs. Update the matching Obsidian fact note when architecture, database, API, roles, deploy, PWA behavior, or major UX rules change.

## Deploy Rule

After changes: run `npm run build`, commit, push, deploy production, then verify `/api/health` and `app-version.json`.
