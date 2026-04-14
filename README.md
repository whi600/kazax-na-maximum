# Кофетерий

Сайт для учёта смены, графика и архива с локальной базой SQLite.

## Стек

- Frontend: Vue 3 + Vite + Tailwind
- Backend: Node.js (native `http`)
- База данных: SQLite (`data/kofeteriy.sqlite`)

## Установка

```bash
npm install
```

## Запуск в разработке

В двух терминалах:

```bash
npm run dev:api
```

```bash
npm run dev
```

Frontend: `http://localhost:5173`

API: `http://localhost:8787`

Vite проксирует `/api/*` на backend автоматически.

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

## Хранилище данных

- БД создаётся автоматически: `data/kofeteriy.sqlite`
- Миграции и базовые товары применяются автоматически при старте backend.
