#!/usr/bin/env bash
# Restore a backup made by scripts/backup.sh into the running docker deployment.
# Usage: scripts/restore.sh <backup-dir>      ⚠ replaces the current database and media/export files.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${1:?usage: scripts/restore.sh <backup-dir>}"
[ -f "$SRC/db.sql.gz" ] || { echo "no db.sql.gz in $SRC" >&2; exit 1; }
set -a; [ -f .env ] && source .env; set +a
PGUSER="${POSTGRES_USER:-bb}"; PGDB="${POSTGRES_DB:-bb}"
PROJECT="$(docker compose config --format json | sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' | head -1)"

read -r -p "This replaces database '$PGDB' and the media/exports volumes of project '$PROJECT'. Continue? [y/N] " ans
[ "${ans:-}" = "y" ] || exit 1

echo "→ stopping web"
docker compose stop web
echo "→ database"
docker compose exec -T postgres psql -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$PGDB\";" -c "CREATE DATABASE \"$PGDB\";"
gunzip -c "$SRC/db.sql.gz" | docker compose exec -T postgres psql -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1 -q
for VOL in media exports; do
  if [ -f "$SRC/$VOL.tar.gz" ]; then
    echo "→ volume $VOL"
    docker run --rm -v "${PROJECT}_${VOL}:/dst" -v "$(cd "$SRC" && pwd):/in:ro" alpine sh -c "rm -rf /dst/* /dst/.[!.]* 2>/dev/null; cd /dst && tar xzf /in/$VOL.tar.gz"
  fi
done
echo "→ starting web"
docker compose up -d web
echo "✓ restored from $SRC"
