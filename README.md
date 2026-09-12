# Isoko Talents

A skills-to-income marketplace for urban youth in Rwanda. Workers build verified skill profiles, apply to gigs, get matched, and track simulated mobile-money payments. Clients post jobs, review applications, and manage matches. Admins moderate users, approve gigs, and review skill submissions.

**Stack:** React (Vite + TypeScript) · Node.js (Express) · PostgreSQL (Sequelize) · Docker Compose

---

## Project structure

| Path | Description |
|------|-------------|
| `client/` | React + TypeScript frontend (Vite dev server) |
| `server/` | Node.js/Express REST API + Sequelize ORM |
| `docker-compose.yml` | Orchestrates Postgres, API, and client containers |
| `.env.example` | Optional root-level overrides for Docker Compose |

---

## Docker setup and run guide

Docker is the recommended way to run the full stack. One command starts the database, API, and frontend with networking, migrations, and demo data handled automatically.

### Prerequisites

1. **Docker Desktop** (Windows / macOS) or **Docker Engine + Compose** (Linux)
   - [Download Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. **Git** — clone this repository
3. At least **4 GB RAM** allocated to Docker (Docker Desktop → Settings → Resources)

Verify installation:

```bash
docker --version
docker compose version
```

Docker Desktop must be **running** before you use any `docker compose` command. If you see an error like `dockerDesktopLinuxEngine: The system cannot find the file specified`, start Docker Desktop and wait until it reports "Engine running".

---

### Architecture (how containers connect)

```text
┌─────────────────────────────────────────────────────────────┐
│  Your browser                                               │
│  http://localhost:5173                                      │
└──────────────────────────┬──────────────────────────────────┘
                           │  /api, /uploads, /health
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  client container (Vite)                                    │
│  Port 5173 — proxies API traffic to the server container    │
└──────────────────────────┬──────────────────────────────────┘
                           │  http://server:4000
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  server container (Express API)                             │
│  Port 4000 — runs migrations + seeds on startup             │
└──────────────────────────┬──────────────────────────────────┘
                           │  postgres:5432
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  postgres container (PostgreSQL 16)                         │
│  Host port 5433 → container port 5432                       │
└─────────────────────────────────────────────────────────────┘
```

**Why the Vite proxy matters:** The browser cannot reach Docker service names like `server` or `postgres` directly. The client container runs Vite with a proxy so requests to `http://localhost:5173/api` are forwarded to `http://server:4000/api` inside the Docker network.

---

### Quick start (first run)

From the repository root:

```bash
docker compose up --build
```

Leave this terminal open to watch logs, or add `-d` to run in the background:

```bash
docker compose up --build -d
```

**First startup takes 1–3 minutes** while images build, Postgres becomes healthy, migrations run, and seed data is inserted.

When ready, open:

| Service | URL |
|---------|-----|
| **Web app** | http://localhost:5173 |
| **API health check** | http://localhost:4000/health |
| **API base** | http://localhost:4000/api |

> **Note:** Use the web app at port **5173** for normal use. The API at port **4000** is exposed for direct testing (e.g. Postman) and health checks.

---

### What happens on startup

When the `server` container starts, `docker-entrypoint.sh` runs automatically:

1. **Waits for Postgres** — retries migrations until the database accepts connections (up to ~60 seconds)
2. **Runs migrations** — `npm run migrate` creates all tables
3. **Seeds data** — `npm run seed` inserts skill categories and demo users/gigs (skipped safely if data already exists)
4. **Starts the API** — `npm run dev` (nodemon) on port 4000

The `client` container starts only after the API health check passes (`/health` returns 200).

---

### Demo accounts

After seeding, log in with any demo account. **All demo passwords are `password123`.**

| Role | Email | Notes |
|------|-------|-------|
| Admin | `emmanuel@isoko.demo` | Gig approvals, skill reviews, user moderation |
| Admin | `solange@isoko.demo` | Second admin account |
| Admin | `abu@isoko.demo` | Admin account |
| Worker | `seyi@isoko.demo` | Verified digital/web worker |
| Worker | `eric@isoko.demo` | Verified digital/web worker |
| Worker | `patrick@isoko.demo` | Verified digital/web worker |
| Worker | `aline@isoko.demo` | Verified tailoring worker |
| Worker | `jeanbosco@isoko.demo` | Verified electronics repair worker |
| Worker | `claudine@isoko.demo` | Verified tutoring worker |
| Client | `grace@isoko.demo` | Sample client |
| Client | `robert@isoko.demo` | Sample client |
| Client | `diane@isoko.demo` | Sample client |
| Client | `samuel@isoko.demo` | Sample client |

---

### Environment variables

No `.env` files are required for a first Docker run. Defaults are defined in `docker-compose.yml`.

To customize, copy the root example file:

```bash
cp .env.example .env
```

Edit `.env` at the **repository root** (not inside `server/` or `client/`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_USER` | `isoko` | Postgres username |
| `DB_PASSWORD` | `isoko` | Postgres password |
| `DB_NAME` | `isoko_talents_dev` | Database name |
| `JWT_SECRET` | `dev-jwt-secret-change-me` | Secret for signing auth tokens — **change in production** |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime (set in compose, not root `.env`) |
| `GOOGLE_CLIENT_ID` | _(empty)_ | Google OAuth client ID for "Sign in with Google" |
| `SEED_ON_START` | `true` | Run seeders on every server container start |

**Google Sign-In (optional):**

1. Create a client ID in [Google Cloud Console](https://console.cloud.google.com/)
2. Add `http://localhost:5173` as an authorized JavaScript origin
3. Set `GOOGLE_CLIENT_ID` in root `.env` and restart:

```bash
docker compose down
docker compose up --build
```

---

### Ports reference

| Port | Service | Access |
|------|---------|--------|
| `5173` | Vite (frontend) | Browser → http://localhost:5173 |
| `4000` | Express API | Browser/Postman → http://localhost:4000 |
| `5433` | PostgreSQL | Host tools (pgAdmin, DBeaver) → `localhost:5433` |

Inside Docker, services use internal hostnames:

- API connects to Postgres at `postgres:5432`
- Vite proxies to API at `server:4000`

Port `5433` on the host avoids conflicting with a local Postgres install on the default `5432`.

---

### Common Docker commands

**Start (build if images changed):**

```bash
docker compose up --build
```

**Start in background:**

```bash
docker compose up --build -d
```

**Stop containers (keep data):**

```bash
docker compose down
```

**Stop and delete database + uploads (full reset):**

```bash
docker compose down -v
```

Then `docker compose up --build` again for a clean database with fresh seed data.

**View logs:**

```bash
docker compose logs -f          # all services
docker compose logs -f server   # API only
docker compose logs -f client   # frontend only
docker compose logs -f postgres # database only
```

**Check container status:**

```bash
docker compose ps
```

All three services should show `running` (and `healthy` for `postgres` and `server`).

**Run migrations manually** (e.g. after pulling new migration files):

```bash
docker compose exec server npm run migrate
```

**Run seeders manually:**

```bash
docker compose exec server npm run seed
```

**Open a shell inside the API container:**

```bash
docker compose exec server sh
```

**Rebuild a single service:**

```bash
docker compose up --build server
docker compose up --build client
```

---

### Verifying the setup

1. **Health check** — visit http://localhost:4000/health  
   Expected: `{"status":"ok"}`

2. **Web app** — visit http://localhost:5173  
   Expected: login page loads without console network errors

3. **Login** — use `emmanuel@isoko.demo` / `password123`  
   Expected: admin dashboard with pending reviews / gig approvals

4. **API via proxy** — while logged in, the dashboard should load matches and stats (confirms client → Vite proxy → API path works)

---

### Troubleshooting

#### `dockerDesktopLinuxEngine` / "cannot find the file specified"

Docker Desktop is not running. Start it and wait until the engine is ready, then retry.

#### `env file ... not found`

Older compose files required `server/.env` and `client/.env`. The current setup uses inline defaults in `docker-compose.yml`. Pull the latest `docker-compose.yml` or ensure you are not referencing missing `env_file` entries.

#### Client loads but API calls fail (network errors in browser)

- Confirm the API is healthy: http://localhost:4000/health
- Check server logs: `docker compose logs server`
- Use the app at **http://localhost:5173** (not a cached build on another port)
- Restart: `docker compose down && docker compose up --build`

#### Server exits or keeps restarting

- Check logs: `docker compose logs server`
- Often a migration failure or Postgres not ready — wait 30s and check again
- Full reset: `docker compose down -v && docker compose up --build`

#### Port already in use

Another process is using `5173`, `4000`, or `5433`. Stop it or change the host port in `docker-compose.yml`:

```yaml
ports:
  - '5174:5173'   # example: map host 5174 to client
```

#### Seed data missing / cannot log in with demo accounts

```bash
docker compose exec server npm run seed
```

Or wipe volumes and restart:

```bash
docker compose down -v
docker compose up --build
```

#### Changes to server code not appearing

Nodemon reloads on file changes via the bind mount. If stuck:

```bash
docker compose restart server
```

#### `node_modules` issues after dependency changes

Rebuild the affected service:

```bash
docker compose build --no-cache server
docker compose up server
```

---

### Data persistence

Docker volumes keep data across restarts:

| Volume | Purpose |
|--------|---------|
| `postgres_data` | Database files |
| `server_uploads` | Uploaded gig images |

`docker compose down` **keeps** these volumes.  
`docker compose down -v` **deletes** them.

Source code is bind-mounted from your machine (`./server` and `./client`), so edits on disk are reflected inside containers without rebuilding.

---

## Running without Docker

If you prefer a local Node setup instead of containers:

```bash
# 1. Environment files
cp server/.env.example server/.env
cp client/.env.example client/.env

# Edit server/.env: set DB_HOST=127.0.0.1 (not "postgres")
# client/.env already points VITE_API_URL to http://localhost:4000/api

# 2. Postgres must be running locally on port 5432 with matching credentials

# 3. API
cd server
npm install
npm run migrate
npm run seed
npm run dev

# 4. Frontend (separate terminal)
cd client
npm install
npm run dev
```

- Client: http://localhost:5173  
- API: http://localhost:4000/api  

Without Docker, the Vite proxy still forwards `/api` to `http://localhost:4000` (see `client/vite.config.ts`).

---

## Database migrations (manual)

From the repo root with Docker running:

```bash
docker compose exec server npm run migrate
docker compose exec server npm run migrate:undo   # roll back last migration
```

Without Docker:

```bash
cd server
npm run migrate
npm run migrate:undo
```
