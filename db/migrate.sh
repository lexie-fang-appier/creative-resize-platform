#!/usr/bin/env bash
# Applies schema.sql then seed_rtb_banner_native.sql against $DATABASE_URL.
# Usage: DATABASE_URL=postgres://... bash db/migrate.sh
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. Example:" >&2
  echo '  export DATABASE_URL="postgres://postgres:postgres@localhost:5432/creative_resize_dev"' >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Applying schema.sql..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/schema.sql"

echo "Applying seed_rtb_banner_native.sql..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/seed_rtb_banner_native.sql"

echo "Done."
