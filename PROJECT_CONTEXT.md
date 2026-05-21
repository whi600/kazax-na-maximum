# Project Context

Short, stable facts for quick context loading.

- Product: PWA for shifts, reports, archive, roles, product assortment, and push notifications.
- Stack: Vue 3 + Vite + Tailwind + Node http + PostgreSQL + Web Push.
- Prod: `https://restosmena.ru` on server `194.67.121.51`.
- Main deploy script: `scripts/update-production.sh`.
- Key runtime files: `server/index.js`, `server/auth.js`, `server/db.js`, `server/notifications.js`, `server/push.js`, `src/navigation.js`, `src/permissions.js`.
- Detailed notes: Obsidian vault `Проекты/Kofeyny`.
- Workflow rule: after each code change, commit, push, then run `/opt/kofeteriy/app/scripts/update-production.sh`; check logs only if something fails.
- Decomposition rule: target files around 200 lines when practical; if a file grows past about 400 lines, split it by responsibility unless there is a clear reason not to.

## What to check after code changes

- Navigation or screens: `src/navigation.js`, `src/App.vue`, `src/components/*` and `50-Фронтенд/02-Навигация-и-экраны.md`.
- API or data flow: `server/index.js`, `server/statements/*`, `server/http.js`, `40-API/*`, `30-База-данных/*`.
- Roles or access rules: `src/permissions.js`, `server/auth.js`, `server/index.js`, `70-Права/01-Роли-и-доступы.md`.
- Deploy or env: `docker-compose.yml`, `Dockerfile`, `scripts/update-production.sh`, `60-Деплой/*`.

## Rule

If a fact changes, update the matching Obsidian note first, then this file if the high-level summary changed.
