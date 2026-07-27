#!/bin/bash
#
# Backup restoration drill.
#
# Proves a pg_dump of the primary database can actually be restored — a backup
# that has never been restored is not a backup. The drill runs end to end
# against a throwaway sandbox database:
#
#   1. dump the source database with pg_dump (custom format, as the backup
#      service in backend/src/services/databaseBackup.ts does)
#   2. restore that dump into a fresh sandbox database with pg_restore
#   3. compare table, index and row counts between source and sandbox
#
# Any mismatch exits non-zero so the caller (CI) can raise an alert.
#
# Usage:
#   SOURCE_DATABASE_URL=postgres://... SANDBOX_DATABASE_URL=postgres://... \
#     ./scripts/verify-backup-restore.sh
#
# Environment:
#   SOURCE_DATABASE_URL   Database to back up. Read-only; never written to.
#   SANDBOX_DATABASE_URL  Scratch database to restore into. DROPPED AND RECREATED.
#   REPORT_PATH           Optional path for the machine-readable summary.

set -euo pipefail

SOURCE_DATABASE_URL="${SOURCE_DATABASE_URL:-}"
SANDBOX_DATABASE_URL="${SANDBOX_DATABASE_URL:-}"
REPORT_PATH="${REPORT_PATH:-backup-verification-report.txt}"

if [[ -z "$SOURCE_DATABASE_URL" || -z "$SANDBOX_DATABASE_URL" ]]; then
  echo "❌ SOURCE_DATABASE_URL and SANDBOX_DATABASE_URL must both be set." >&2
  exit 2
fi

for binary in pg_dump pg_restore psql; do
  if ! command -v "$binary" &> /dev/null; then
    echo "❌ Required binary '$binary' not found on PATH." >&2
    exit 2
  fi
done

WORK_DIR="$(mktemp -d)"
DUMP_FILE="$WORK_DIR/backup.dump"
trap 'rm -rf "$WORK_DIR"' EXIT

STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Counts only the application schema — pg_catalog and information_schema are
# server-owned and are not part of the dump.
COUNT_TABLES_SQL="SELECT count(*) FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
COUNT_INDEXES_SQL="SELECT count(*) FROM pg_indexes WHERE schemaname = 'public';"
LIST_TABLES_SQL="SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
LIST_INDEXES_SQL="SELECT indexname FROM pg_indexes
  WHERE schemaname = 'public' ORDER BY indexname;"

# Runs a scalar query and trims psql's surrounding whitespace.
scalar_query() {
  local url="$1"
  local sql="$2"
  psql "$url" -tAc "$sql" | tr -d '[:space:]'
}

# Sums live row counts across every public table. Uses an exact count rather
# than pg_class.reltuples, which is only an estimate refreshed by ANALYZE.
total_rows() {
  local url="$1"
  local sql
  sql="$(psql "$url" -tAc "
    SELECT coalesce(
      string_agg(format('SELECT count(*) FROM %I.%I', schemaname, tablename), ' UNION ALL '),
      'SELECT 0'
    )
    FROM pg_tables WHERE schemaname = 'public';
  ")"
  psql "$url" -tAc "SELECT coalesce(sum(c), 0) FROM ($sql) AS counts(c);" | tr -d '[:space:]'
}

echo "=========================================="
echo "🗄️  Backup Restoration Drill"
echo "=========================================="
echo "Started: $STARTED_AT"

# ── 1. Snapshot the source ────────────────────────────────────────────────
echo ""
echo "▶ Capturing source database metrics..."
SOURCE_TABLES="$(scalar_query "$SOURCE_DATABASE_URL" "$COUNT_TABLES_SQL")"
SOURCE_INDEXES="$(scalar_query "$SOURCE_DATABASE_URL" "$COUNT_INDEXES_SQL")"
SOURCE_ROWS="$(total_rows "$SOURCE_DATABASE_URL")"
echo "  tables=$SOURCE_TABLES indexes=$SOURCE_INDEXES rows=$SOURCE_ROWS"

if [[ "$SOURCE_TABLES" -eq 0 ]]; then
  echo "❌ Source database has no tables — refusing to certify an empty backup." >&2
  exit 1
fi

# ── 2. Take the backup ────────────────────────────────────────────────────
echo ""
echo "▶ Running pg_dump..."
pg_dump "$SOURCE_DATABASE_URL" -F c -f "$DUMP_FILE"

if [[ ! -s "$DUMP_FILE" ]]; then
  echo "❌ pg_dump produced an empty archive." >&2
  exit 1
fi
DUMP_BYTES="$(wc -c < "$DUMP_FILE" | tr -d '[:space:]')"
echo "  archive size: $DUMP_BYTES bytes"

# The archive's own table of contents is the first integrity gate — a
# truncated or corrupt dump fails here before any restore is attempted.
echo ""
echo "▶ Validating archive table of contents..."
pg_restore --list "$DUMP_FILE" > "$WORK_DIR/toc.txt"
TOC_ENTRIES="$(grep -c ';' "$WORK_DIR/toc.txt" || true)"
echo "  $TOC_ENTRIES catalog entries"

# ── 3. Restore into the sandbox ───────────────────────────────────────────
echo ""
echo "▶ Restoring into sandbox database..."
psql "$SANDBOX_DATABASE_URL" -q -c "DROP SCHEMA IF EXISTS public CASCADE;" \
  -c "CREATE SCHEMA public;"
pg_restore -d "$SANDBOX_DATABASE_URL" --no-owner --no-privileges "$DUMP_FILE"

# ── 4. Compare source against restored ────────────────────────────────────
echo ""
echo "▶ Verifying restored schema, indices and records..."
RESTORED_TABLES="$(scalar_query "$SANDBOX_DATABASE_URL" "$COUNT_TABLES_SQL")"
RESTORED_INDEXES="$(scalar_query "$SANDBOX_DATABASE_URL" "$COUNT_INDEXES_SQL")"
RESTORED_ROWS="$(total_rows "$SANDBOX_DATABASE_URL")"
echo "  tables=$RESTORED_TABLES indexes=$RESTORED_INDEXES rows=$RESTORED_ROWS"

FAILURES=()

if [[ "$SOURCE_TABLES" != "$RESTORED_TABLES" ]]; then
  FAILURES+=("table count mismatch: source=$SOURCE_TABLES restored=$RESTORED_TABLES")
fi
if [[ "$SOURCE_INDEXES" != "$RESTORED_INDEXES" ]]; then
  FAILURES+=("index count mismatch: source=$SOURCE_INDEXES restored=$RESTORED_INDEXES")
fi
if [[ "$SOURCE_ROWS" != "$RESTORED_ROWS" ]]; then
  FAILURES+=("row count mismatch: source=$SOURCE_ROWS restored=$RESTORED_ROWS")
fi

# Name-level diffs, so a report says *which* object went missing rather than
# just that a count moved.
psql "$SOURCE_DATABASE_URL" -tAc "$LIST_TABLES_SQL" > "$WORK_DIR/source_tables.txt"
psql "$SANDBOX_DATABASE_URL" -tAc "$LIST_TABLES_SQL" > "$WORK_DIR/restored_tables.txt"
psql "$SOURCE_DATABASE_URL" -tAc "$LIST_INDEXES_SQL" > "$WORK_DIR/source_indexes.txt"
psql "$SANDBOX_DATABASE_URL" -tAc "$LIST_INDEXES_SQL" > "$WORK_DIR/restored_indexes.txt"

MISSING_TABLES="$(comm -23 "$WORK_DIR/source_tables.txt" "$WORK_DIR/restored_tables.txt" | tr '\n' ' ')"
MISSING_INDEXES="$(comm -23 "$WORK_DIR/source_indexes.txt" "$WORK_DIR/restored_indexes.txt" | tr '\n' ' ')"

if [[ -n "${MISSING_TABLES// /}" ]]; then
  FAILURES+=("tables missing after restore: $MISSING_TABLES")
fi
if [[ -n "${MISSING_INDEXES// /}" ]]; then
  FAILURES+=("indices missing after restore: $MISSING_INDEXES")
fi

FINISHED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# ── 5. Write the summary ──────────────────────────────────────────────────
{
  echo "Backup Restoration Verification"
  echo "==============================="
  echo "started_at=$STARTED_AT"
  echo "finished_at=$FINISHED_AT"
  echo "archive_bytes=$DUMP_BYTES"
  echo "catalog_entries=$TOC_ENTRIES"
  echo "source_tables=$SOURCE_TABLES restored_tables=$RESTORED_TABLES"
  echo "source_indexes=$SOURCE_INDEXES restored_indexes=$RESTORED_INDEXES"
  echo "source_rows=$SOURCE_ROWS restored_rows=$RESTORED_ROWS"
  if [[ ${#FAILURES[@]} -eq 0 ]]; then
    echo "result=PASS"
  else
    echo "result=FAIL"
    for failure in "${FAILURES[@]}"; do
      echo "failure=$failure"
    done
  fi
} | tee "$REPORT_PATH"

echo ""
if [[ ${#FAILURES[@]} -gt 0 ]]; then
  echo "=========================================="
  echo "❌ Backup verification FAILED"
  echo "=========================================="
  for failure in "${FAILURES[@]}"; do
    echo "  - $failure" >&2
  done
  exit 1
fi

echo "=========================================="
echo "✅ Backup verification PASSED"
echo "   $RESTORED_TABLES tables, $RESTORED_INDEXES indices, $RESTORED_ROWS rows restored intact"
echo "=========================================="
