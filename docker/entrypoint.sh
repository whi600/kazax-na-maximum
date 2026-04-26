#!/usr/bin/env sh
set -eu

mkdir -p /app/data/uploads

exec "$@"
