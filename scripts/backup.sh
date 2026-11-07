#!/usr/bin/env bash
# Back up the docker deployment: Postgres dump + media and export volumes.
# Usage: scripts/backup.sh [backup-root]   (default ./backups) → ./backups/<timestamp>/
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$ROOT/$STAMP"
mkdir -p "$OUT"
set -a; [ -f .env ] && source .env; set +a
PGUSER="${POSTGRES_USER:-bb}"; PGDB="${POSTGRES_DB:-bb}"
PROJECT="$(docker compose config --format json | sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' | head -1)"

echo "→ database ($PGDB)"
docker compose exec -T postgres pg_dump -U "$PGUSER" -d "$PGDB" --no-owner --no-privileges | gzip > "$OUT/db.sql.gz"
for VOL in media exports; do
  echo "→ volume $VOL"
  docker run --rm -v "${PROJECT}_${VOL}:/src:ro" -v "$(cd "$OUT" && pwd):/out" alpine sh -c "cd /src && tar czf /out/$VOL.tar.gz ."
done
cp .env "$OUT/env.backup" 2>/dev/null || true
chmod 600 "$OUT/env.backup" 2>/dev/null || true
echo "✓ backup written to $OUT"
du -sh "$OUT"/* | sed 's/^/  /'
