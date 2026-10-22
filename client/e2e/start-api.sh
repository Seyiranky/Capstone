#!/bin/sh
# Starts the API for the end-to-end tests on a fresh copy of the demo data.
#
# The database is emptied, migrated and seeded on every run, so the tests never
# depend on what an earlier run (or a person) did. It refuses any database whose
# name does not end in _e2e: it must never touch development or production data.
set -e
case "$DB_NAME" in
  *_e2e) ;;
  *) echo "Refusing to reset '$DB_NAME': the end-to-end database must end in _e2e." >&2; exit 1 ;;
esac
cd "$(dirname "$0")/../../server"
npx sequelize-cli db:migrate:undo:all >/dev/null
npx sequelize-cli db:migrate >/dev/null
npm run seed >/dev/null
exec npx tsx src/server.ts
