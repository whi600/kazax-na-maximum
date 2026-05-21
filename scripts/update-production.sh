#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${REPO_URL:-git@github.com:kurnikovmihail/kofeteriy.git}"
BRANCH="${BRANCH:-master}"
APP_ROOT="${APP_ROOT:-/opt/kofeteriy}"
APP_DIR="${APP_DIR:-$APP_ROOT/app}"
ENV_FILE="${ENV_FILE:-$APP_ROOT/.env}"
PROJECT_NAME="${PROJECT_NAME:-kofeteriy}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8787/api/health}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command is missing: $1" >&2
    exit 1
  fi
}

ensure_env_value() {
  local key="$1"
  local value="$2"

  if ! grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

ensure_env_file() {
  mkdir -p "$APP_ROOT" "$APP_ROOT/data" "$APP_ROOT/postgres"
  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"

  ensure_env_value "POSTGRES_DB" "kofeteriy"
  ensure_env_value "POSTGRES_USER" "kofeteriy"

  if ! grep -q '^POSTGRES_PASSWORD=' "$ENV_FILE"; then
    ensure_env_value "POSTGRES_PASSWORD" "$(openssl rand -hex 24)"
  fi

  ensure_env_value "APP_PORT" "127.0.0.1:8787"
  ensure_env_value "DATA_DIR" "$APP_ROOT/data"
  ensure_env_value "POSTGRES_DATA_DIR" "$APP_ROOT/postgres"
  ensure_env_value "APP_TIMEZONE" "Asia/Yekaterinburg"
}

ensure_repo() {
  if [ -d "$APP_DIR/.git" ]; then
    git -C "$APP_DIR" fetch origin "$BRANCH"
    git -C "$APP_DIR" reset --hard "origin/$BRANCH"
    git -C "$APP_DIR" clean -fd
    return
  fi

  if [ -f "$APP_DIR/docker-compose.yml" ]; then
    echo "Using existing non-git app directory: $APP_DIR"
    echo "To update source files on this server, sync a fresh archive before running this script."
    return
  fi

  if [ -d "$APP_DIR" ] && [ -n "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
    local backup_dir="$APP_ROOT/app-before-git-$(date +%Y%m%d-%H%M%S)"
    mv "$APP_DIR" "$backup_dir"
    echo "Moved existing non-git app directory to $backup_dir"
  fi

  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
}

remove_legacy_container() {
  local name="$1"
  local project

  if ! docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    return
  fi

  project="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$name" 2>/dev/null || true)"
  if [ "$project" = "$PROJECT_NAME" ]; then
    return
  fi

  echo "Removing legacy container: $name"
  docker rm -f "$name" >/dev/null
}

wait_for_health() {
  for _ in $(seq 1 30); do
    if curl -fsS "$HEALTH_URL" >/dev/null; then
      curl -fsS "$HEALTH_URL"
      printf '\n'
      return
    fi
    sleep 1
  done

  echo "Health check failed: $HEALTH_URL" >&2
  docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    -f "$APP_DIR/docker-compose.yml" \
    logs --tail=120 app >&2
  exit 1
}

main() {
  require_command git
  require_command docker
  require_command curl
  require_command openssl

  ensure_env_file
  ensure_repo

  remove_legacy_container kofeteriy-app
  remove_legacy_container kofeteriy-db

  docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    -f "$APP_DIR/docker-compose.yml" \
    up -d --build --remove-orphans

  wait_for_health

  docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    -f "$APP_DIR/docker-compose.yml" \
    ps
}

main "$@"
