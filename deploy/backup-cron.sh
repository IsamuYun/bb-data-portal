#!/usr/bin/env bash
# Nightly backup for cron: scripts/backup.sh into BACKUP_ROOT, keep KEEP_DAYS days, optional off-site copy.
#   0 3 * * * /opt/bb-data-portal/deploy/backup-cron.sh >> /var/log/bb-backup.log 2>&1
# Off-site: set OFFSITE to an rsync destination (user@host:/path) or an rclone remote (remote:bucket/path).
set -euo pipefail
cd "$(dirname "$0")/.."
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/bb-data-portal}"
KEEP_DAYS="${KEEP_DAYS:-14}"
OFFSITE="${OFFSITE:-}"
echo "== $(date -Is) backup start"
scripts/backup.sh "$BACKUP_ROOT"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +
if [ -n "$OFFSITE" ]; then
  if [[ "$OFFSITE" == *@*:* ]]; then rsync -a --delete "$BACKUP_ROOT/" "$OFFSITE/"
  else rclone sync "$BACKUP_ROOT" "$OFFSITE"; fi
fi
echo "== $(date -Is) backup done"
