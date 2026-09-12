#!/bin/sh
set -e

echo "Waiting for PostgreSQL and applying migrations..."

for attempt in $(seq 1 30); do
  if npm run migrate; then
    echo "Migrations applied."
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "Could not connect to the database after 30 attempts."
    exit 1
  fi
  echo "Database not ready yet (attempt ${attempt}/30), retrying in 2s..."
  sleep 2
done

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "Seeding reference data..."
  npm run seed || echo "Seed step skipped (data may already exist)."
fi

echo "Starting API server..."
exec npm run dev
