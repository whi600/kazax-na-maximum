# Project Context

Short, stable facts only. Load this first; open detailed notes only when the task touches that area.

- Product: PWA for shifts, reports, archive, roles, product assortment, and push notifications.
- Stack: Vue 3 + Vite + Tailwind + Node http + PostgreSQL + Web Push.
- Prod: `https://restosmena.ru` on server `194.67.121.51`.
- Main deploy script: `scripts/update-production.sh`.
- Key runtime files: `server/index.js`, `server/routes/*`, `server/auth.js`, `server/db.js`, `server/notifications.js`, `server/push.js`, `src/navigation.js`, `src/permissions.js`.
- Data safety: PostgreSQL persists business data; report/product/schedule writes use revisions and idempotency, and report drafts use a local offline outbox.
- Tests: choose scope by change risk; available commands are `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, and `npm run test:all` against an isolated PostgreSQL database. On success, inspect only the final status; read logs only after a failure.
- Detailed notes: Obsidian vault `Проекты/Kofeyny`.
- Workflow rule: after accepted code changes, commit, push, then run `/opt/kofeteriy/app/scripts/update-production.sh`; feature branches stay off production until explicit acceptance.
- Decomposition rule: target files around 200 lines when practical; if a file grows past about 400 lines, split it by responsibility unless there is a clear reason not to.
- Reminder: big long files are bad; split them early.
- Token rule: use `rg` and narrow ranges; avoid full-file reads for large files unless required.
- Large-file exceptions to read narrowly: legacy migrations and integration tests; production modules should remain below about 400 lines.

## What to check after code changes

- Navigation or screens: `src/navigation.js`, `src/App.vue`, `src/components/*` and `50-Фронтенд/02-Навигация-и-экраны.md`.
- API or data flow: `server/index.js`, `server/statements/*`, `server/http.js`, `40-API/*`, `30-База-данных/*`.
- Roles or access rules: `src/permissions.js`, `server/auth.js`, `server/index.js`, `70-Права/01-Роли-и-доступы.md`.
- Deploy or env: `docker-compose.yml`, `Dockerfile`, `scripts/update-production.sh`, `60-Деплой/*`.
- AI workflow/context rules: `99-Как-обновлять-факты.md`.

## Rule

If a fact changes, update the matching Obsidian note first, then this file if the high-level summary changed.
