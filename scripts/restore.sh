#!/usr/bin/env bash
# Usage: ./scripts/restore.sh backups/lifeops-YYYYMMDD-HHMMSS.sql.gz   (DESTRUCTIVE: replaces current data)
set -euo pipefail
[ $# -eq 1 ] || { echo "usage: $0 <dump.sql.gz>"; exit 1; }
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
read -r -p "This replaces ALL current data. Type 'restore' to continue: " ok
[ "$ok" = "restore" ] || exit 1
docker compose stop backend nginx
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE);" -c "CREATE DATABASE \"$POSTGRES_DB\";"
gunzip -c "$1" | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
docker compose up -d
