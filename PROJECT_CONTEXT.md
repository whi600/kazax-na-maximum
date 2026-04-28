# Project Context

Short, stable facts for quick context loading.

- Product: PWA for shifts, reports, archive, messenger.
- Stack: Vue 3 + Vite + Tailwind + Node http + PostgreSQL.
- Prod: `restosmena.ru` on `94.198.218.48`.
- Main deploy script: `scripts/update-production.sh`.
- Key runtime files: `server/index.js`, `server/db.js`, `src/navigation.js`, `src/permissions.js`.
- Detailed notes: Obsidian vault `Проекты/Kofeyny`.
- Workflow rule: after each code change, commit, push, then run `/opt/kofeteriy/app/scripts/update-production.sh`; check logs only if something fails.

## What to check after code changes

- Navigation or screens: `src/navigation.js`, `src/App.vue`, `src/components/*` and `50-Фронтенд/02-Навигация-и-экраны.md`.
- API or data flow: `server/index.js`, `server/db.js`, `40-API/*`, `30-База-данных/*`.
- Roles or access rules: `src/permissions.js`, `server/index.js`, `70-Права/01-Роли-и-доступы.md`.
- Deploy or env: `docker-compose.yml`, `Dockerfile`, `scripts/update-production.sh`, `60-Деплой/*`.
- Messenger: `src/messengerUtils.js`, `server/index.js`, `40-API/02-Группы-маршрутов.md`.

## Rule

If a fact changes, update the matching Obsidian note first, then this file if the high-level summary changed.
