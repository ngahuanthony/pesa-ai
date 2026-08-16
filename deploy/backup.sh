#!/bin/bash
# Pesa AI — Daily database backup
# Runs via cron at 2am. Keeps last 14 days of backups.
# Usage: /usr/local/bin/pesa-backup

BACKUP_DIR="/opt/pesa-ai-backups"
DB_FILE="/opt/pesa-ai/artifacts/api-server/data/db.json"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M)
BACKUP_FILE="$BACKUP_DIR/db-$TIMESTAMP.json"

mkdir -p "$BACKUP_DIR"

if [ -f "$DB_FILE" ]; then
    cp "$DB_FILE" "$BACKUP_FILE"
    echo "[$TIMESTAMP] Backup saved: $BACKUP_FILE"
    # Keep only last 14 days
    find "$BACKUP_DIR" -name "db-*.json" -mtime +14 -delete
    echo "[$TIMESTAMP] Old backups cleaned up."
else
    echo "[$TIMESTAMP] WARNING: db.json not found at $DB_FILE"
fi
