# Кафетерий

PWA для учёта смен, графика и архива отчётов.

## Стек

- Frontend: Vue 3 + Vite + Tailwind
- Backend: Node.js (native `http`)
- База данных: PostgreSQL

## Установка

```bash
npm install
```

## Запуск в разработке

Сначала поднимите PostgreSQL. Быстрее всего через Docker:

```bash
docker run -d --name kofeteriy-postgres \
  -e POSTGRES_DB=kofeteriy \
  -e POSTGRES_USER=kofeteriy \
  -e POSTGRES_PASSWORD=kofeteriy \
  -p 127.0.0.1:5432:5432 \
  postgres:16-alpine
```

Затем запустите backend и frontend в двух терминалах:

```bash
npm run dev:api
```

```bash
npm run dev
```

Frontend: `http://localhost:5173`

API: `http://localhost:8787`

Vite проксирует `/api/*` на backend автоматически.

Backend читает подключение из `DATABASE_URL` или переменных `PGHOST`, `PGPORT`,
`PGDATABASE`, `PGUSER`, `PGPASSWORD`. Локальные значения по умолчанию:
`kofeteriy/kofeteriy@localhost:5432/kofeteriy`.

## Первый вход

1. Откройте сайт.
2. Зарегистрируйте первого пользователя.
3. Первый зарегистрированный пользователь автоматически получает роль `admin`.

## Продакшен

Собрать фронтенд:

```bash
npm run build
```

Запустить сервер (API + выдача `dist`):

```bash
npm run start
```

Обновить продакшен-сервер из GitHub и пересобрать Docker:

```bash
/opt/kofeteriy/app/scripts/update-production.sh
```

Скрипт подтягивает `master`, пересобирает контейнер приложения, сохраняет
PostgreSQL-данные в `/opt/kofeteriy/postgres` и проверяет `/api/health`.

## Хранилище данных

- Таблицы PostgreSQL, миграции и базовые товары применяются автоматически при старте backend.
- Загруженные файлы мессенджера лежат в `data/uploads`.
- Для Docker Compose используйте `docker compose up -d --build`.

## Перенос со SQLite

Старую SQLite-базу можно перенести в PostgreSQL:

```bash
DATABASE_URL=postgres://kofeteriy:kofeteriy@localhost:5432/kofeteriy \
  npm run migrate:postgres -- data/kofeteriy.sqlite
```

Если нужно полностью заменить данные в целевой PostgreSQL-базе, добавьте
`--replace`. Используйте это только после резервной копии.
