#!/usr/bin/env sh
set -eu

mkdir -p /app/data/uploads

if [ ! -f /app/data/kofeteriy.sqlite ] && [ -f /app/seed-data/kofeteriy.sqlite ]; then
  cp /app/seed-data/kofeteriy.sqlite /app/data/kofeteriy.sqlite
fi

exec "$@"
