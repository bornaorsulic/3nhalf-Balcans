#!/usr/bin/env bash
# One-time database setup on the VM: schema, demo patient, demo accounts.
# Re-running is safe — it replaces those rows rather than duplicating them.
#
#   cd deploy && ./seed.sh
set -euo pipefail

cd "$(dirname "$0")"

run() {
  echo "→ $*"
  docker compose run --rm backend python "$@"
}

run scripts/setup_database.py
# data/patient_demo.json is committed. To refresh the dates, run `npm run export:demo`
# on your machine, commit the file, and redeploy.
run scripts/ingest_patient.py
run scripts/seed_accounts.py

echo
echo "Seeded. Check it with:"
echo "  docker compose run --rm backend python scripts/check_database.py"
