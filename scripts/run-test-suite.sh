#!/usr/bin/env bash
set -Eeuo pipefail

suite="${1:-}"
project_name="kofeteriy-test"
compose_file="docker-compose.test.yml"
test_port="${TEST_PG_PORT:-55432}"
export DATABASE_URL="postgresql://kofeteriy_test:kofeteriy_test@127.0.0.1:${test_port}/kofeteriy_test"
export NODE_ENV="test"
export SKIP_DEFAULT_PRODUCTS="1"
export DISABLE_BACKGROUND_JOBS="1"
export TZ="Asia/Yekaterinburg"
export NO_PROXY="localhost,127.0.0.1"
export no_proxy="$NO_PROXY"

cleanup() {
  docker compose -p "$project_name" -f "$compose_file" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -p "$project_name" -f "$compose_file" up -d --wait db >/dev/null
node scripts/reset-test-database.js

case "$suite" in
  integration)
    npm run test:integration:ci
    ;;
  e2e)
    npm run test:e2e:ci
    ;;
  *)
    echo "Usage: $0 integration|e2e" >&2
    exit 2
    ;;
esac
