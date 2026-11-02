#!/usr/bin/env bash
# Usage: ./scripts/backup.sh   (cron suggestion: 0 3 * * *)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
mkdir -p backups
ts=$(date +%Y%m%d-%H%M%S)
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner | gzip > "backups/lifeops-$ts.sql.gz"
docker run --rm -v lifeops_lifeops_uploads:/data:ro -v "$PWD/backups":/out alpine tar czf "/out/uploads-$ts.tar.gz" -C /data .
# keep the newest 14 of each
ls -1t backups/lifeops-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --
ls -1t backups/uploads-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm --
echo "Backup written: backups/lifeops-$ts.sql.gz"
