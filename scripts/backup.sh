#!/usr/bin/env bash
# Back up the Postgres database. It holds everything that changes — including the OUTBOX, so
# pending approvals survive a restore. Neon also keeps point-in-time history; this dump is our
# own copy, outside the provider. Vercel Blob is durable but has no object lock: keep your own copy of signed contracts too.
#
# Usage: DATABASE_URL=... ./scripts/backup.sh [out_dir]
# Restore is NOT automated on purpose — test it by hand into a scratch DB (see docs/runbook.md).
set -euo pipefail

OUT_DIR="${1:-./backups}"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
mkdir -p "$OUT_DIR"

: "${DATABASE_URL:?set DATABASE_URL (a direct, non-pooled Neon connection string)}"

echo "Backing up Postgres -> $OUT_DIR/db-$STAMP.dump"
pg_dump --format=custom --no-owner "$DATABASE_URL" > "$OUT_DIR/db-$STAMP.dump"

echo "Done. Now test a restore into a scratch DB before trusting it:"
echo "  createdb nw_restore_check && pg_restore --no-owner -d nw_restore_check $OUT_DIR/db-$STAMP.dump"
