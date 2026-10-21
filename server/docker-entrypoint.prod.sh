#!/bin/sh
# Production start: migrate, load demo data into an empty database, serve.
# Migrations run on start rather than in a separate release step because the
# free host offers none; a single instance means no two starts race.
set -e

for attempt in $(seq 1 15); do
  if npx sequelize-cli db:migrate; then
    break
  fi
  if [ "$attempt" -eq 15 ]; then
    echo "Could not reach the database to migrate after 15 attempts."
    exit 1
  fi
  echo "Database not ready (attempt ${attempt}/15); retrying in 4s..."
  sleep 4
done

node dist/scripts/seedIfEmpty.js

exec node dist/server.js
