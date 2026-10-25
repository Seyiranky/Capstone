# Isoko

[![CI](https://github.com/Seyiranky/Capstone/actions/workflows/ci.yml/badge.svg)](https://github.com/Seyiranky/Capstone/actions/workflows/ci.yml)

**A skills-to-income marketplace for young people in Kigali.** Workers prove what they can do,
get matched to nearby paid jobs, and are paid by MTN Mobile Money with a receipt anyone can check.
Clients post jobs and choose from ranked, explained candidates. Admins moderate the marketplace and
watch for unfair practice.

BSc Software Engineering capstone, African Leadership University. Author: Seyi Adebayo.

| | |
|---|---|
| **Live web app** | https://isoko-web.onrender.com |
| **Live API** | https://isoko-api.onrender.com (health check: [`/health`](https://isoko-api.onrender.com/health)) |
| **Walkthrough video** | _VIDEO LINK: to be added_ |
| **Technical report** | _REPORT LINK: to be added_ |
| **Repository** | https://github.com/Seyiranky/Capstone |

> The live site runs on Render's free tier. A pinger keeps it awake. If it has slept anyway, the
> first page can take up to a minute; after that it is quick.

---

## Contents

1. [The problem and the solution](#1-the-problem-and-the-solution)
2. [Features by role](#2-features-by-role)
3. [Try it: demo accounts](#3-try-it-demo-accounts)
4. [Technical requirements](#4-technical-requirements)
5. [Install and run with Docker (recommended)](#5-install-and-run-with-docker-recommended)
6. [Install and run without Docker](#6-install-and-run-without-docker)
7. [Configuration (environment variables)](#7-configuration-environment-variables)
8. [Testing](#8-testing)
9. [Performance](#9-performance)
10. [Architecture](#10-architecture)
11. [Object-oriented design](#11-object-oriented-design)
12. [Algorithms](#12-algorithms)
13. [Repository structure](#13-repository-structure)
14. [Continuous integration](#14-continuous-integration)
15. [Deployment](#15-deployment)
16. [Privacy and data protection](#16-privacy-and-data-protection)
17. [Known limitations](#17-known-limitations)
18. [Further documentation](#18-further-documentation)

---

## 1. The problem and the solution

Young people in Kigali often have real skills, such as tailoring, phone repair, tutoring or web work,
but no way to prove them to a stranger. On open marketplaces the lowest bid wins. A worker's
standing is set by rules they cannot see. Payment is informal and leaves no record.

Isoko answers each of these:

| Problem | What Isoko does |
|---|---|
| Skills cannot be proven | Workers submit evidence of a skill. A **randomly drawn peer reviewer** who does not know them, or an admin, checks it. A verified skill can be shared as a signed **skill passport**. |
| Matching favours whoever is loudest | Candidates are **ranked by distance, trust, skill fit and availability**, and every score shows its reasons. |
| Prices are driven down | Clients posting below what comparable jobs paid are told so, using **rate guidance** from real past payments. |
| Payment is informal | The client pays by **MTN Mobile Money**, and each payment produces a **public receipt** and a **signed income statement** the worker can show a lender. |
| Safety on site | Check-in, check-out and **SOS** for on-site jobs, with a trusted contact reached by SMS. |
| Exclusion by language and data cost | Fully **bilingual (English and Kinyarwanda)**, installable as a **PWA**, works offline for key actions, and loads in half the data it once needed. |

---

## 2. Features by role

### Worker
- Sign up with email and password, or with **Google**. Confirm a phone number by a six-digit SMS code.
- A profile with skills, a CV, certificates, a location (shown on a map) and availability.
- **Skill verification**: submit evidence (photos, files, a description). It is reviewed blind by a peer or an admin. A rejected skill can be appealed.
- **Marketplace**: browse approved gigs, see **why** a gig suits you (the score breakdown), and apply. Sensitive gigs, such as work with children or inside a home, list exactly what is missing and where to fix it.
- **Invitations**: the best-ranked workers are invited to a new gig automatically.
- **Your matches**: every job by stage (to confirm, in progress, awaiting payment, paid…), with filtering, search and sorting, and one clear next action on each card.
- Say "I've finished". The client is reminded if they do not mark the job done.
- **Teams and apprentices**: apply as a crew with shares agreed up front, or bring an apprentice who earns a share and a supervised credential.
- **Wallet**: earnings, payouts, an earnings-by-month chart, a downloadable **income statement (PDF)** and a **safety net** pot.
- **Levels** (New, Rising, Trusted, Master), with every criterion public.
- **Peer reviewer** (for invited workers): a review queue at `/reviews` to approve, reject or **recuse** ("I know this worker", "conflict of interest", "not qualified").
- Messages with the client, including photos and **voice notes**, delivered live.
- **Safe visits**: check in and check out on site, and **SOS**.
- Disputes, notifications (in-app, SMS and email, chosen per category), a help centre and support requests.

### Client
- Post a gig with a budget, skill, location and photos. An admin approves it before workers see it. **Rate guidance** says if the budget is below what comparable jobs paid.
- **Find workers**: a directory of verified workers, with scores and reasons.
- Review applicants, approve one, message them.
- **Mark the job done, then pay by MTN Mobile Money**: the client enters a number, approves on the phone, and a receipt is issued. The worker's payout follows.
- Optional **job cover**: a small premium on the job's payment insures on-site work, with a claim window.
- Reviews (only after a confirmed payment), disputes, support.

### Admin
- **Operations**: gig approvals, applications, skill reviews, jobs, disputes, safety (SOS and visits), the support inbox.
- **Money**: payments (with provider references), job cover and claims.
- **People**: users (suspend or restore), peer reviewers (enrol, tier), reports, the audit log.
- **Insights**: analytics, pilot metrics, the market (rates by category), and a live **Fairwork** score against the Oxford Internet Institute's five principles.
- **System health**: SMS and email delivery, balances, failures.
- **Collusion report**: flags for repeated pairings, rubber-stamping (decisions under 60 s), reviewers who approve or reject everything, prior job relationships, and recusals.

### Everyone
- English or **Kinyarwanda**, kept between visits.
- A public **privacy page**, **data export** and **account deletion** (Rwanda Law 058/2021).
- Public, verifiable receipts, skill passports and income statements, with no sign-in needed to check one.

---

## 3. Try it: demo accounts

All demo accounts use the password **`password123`**. They exist on the live site and in any fresh
local install, and their email and phone are already confirmed.

| Role | Email | What to look at |
|---|---|---|
| Admin | `admin@isoko.demo` | Gig approvals, skill reviews, payments, collusion report |
| Admin | `emmanuel@isoko.demo`, `solange@isoko.demo`, `abu@isoko.demo` | Other admins |
| Client | `grace@isoko.demo` | Post a gig, approve an applicant, mark done and pay |
| Client | `robert@isoko.demo`, `diane@isoko.demo`, `samuel@isoko.demo` | Other clients |
| Worker (peer reviewer) | `eric@isoko.demo` | Digital and web work; applies to gigs; has a review queue |
| Worker (peer reviewer) | `claudine@isoko.demo` | Tutoring; review queue |
| Worker (peer reviewer) | `aline@isoko.demo` | Tailoring |
| Worker (peer reviewer) | `jeanbosco@isoko.demo` | Electronics repair |
| Worker | `seyi@isoko.demo`, `patrick@isoko.demo`, `david@isoko.demo` | Other workers |

**A complete job in five minutes.** Use two browsers, or one normal window and one private window:

1. As `grace@isoko.demo`: **Marketplace › Post a gig**.
2. As `admin@isoko.demo`: **Gig approvals ›** approve it.
3. As `eric@isoko.demo`: open the gig and **Apply**.
4. As Grace: open the gig, then **⋯ › Approve** the applicant.
5. As Eric: **Marketplace › Your matches › Confirm**, then **I've finished**.
6. As Grace: **Your matches › Mark job as done**, then enter a phone number and **Pay**.
7. Open the receipt.

**Payments on the live site** go to the **MTN MoMo sandbox** (test money, in EUR, the only currency
the sandbox accepts). No prompt reaches a real phone: the sandbox approves by itself within seconds.
Use any Rwandan number, for example `0788123456`. Locally, payments are simulated by default, and
an **Approve (simulated phone)** button stands in for the phone. See
[docs/evidence/momo](docs/evidence/momo/README.md).

---

## 4. Technical requirements

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | **24 or later** | `engines` in both `package.json` files; CI and the images use Node 24 |
| npm | 10 or later | Ships with Node 24 |
| **PostgreSQL** | **16 or later** | 16 in Docker and CI, 18 in development, Supabase live |
| Docker Desktop / Docker Engine with Compose v2 | any recent | Only for the Docker route; give it at least 4 GB of memory |
| Git | any | |
| Browser | current Chrome, Edge, Safari, Firefox; Android Chrome, iOS Safari | Tested automatically in Chromium and WebKit, desktop and phone |

**Main libraries**

| Layer | Libraries |
|---|---|
| Web app | React 18.3, TypeScript 5.6, Vite 5.4, Ant Design 6, Redux Toolkit 2, React Router 7, react-i18next, Socket.IO client, Leaflet (maps), @ant-design/charts, vite-plugin-pwa |
| API | Express 5, TypeScript 5.6, Sequelize 6 with `pg`, Socket.IO 4, jsonwebtoken, bcrypt, helmet, multer, compression, google-auth-library, nodemailer |
| Tests | Jest 30 with ts-jest and Supertest (API), Vitest 2 (web), Playwright 1.56 (end-to-end and performance) |
| External services | MTN MoMo Collections API (sandbox), Pindo (SMS), Brevo (email), Google Identity (sign-in), Supabase (Postgres and file storage), Render (hosting) |

None of the external services is needed to run Isoko locally. Each has a stand-in driver that
logs instead of sending (see [section 7](#7-configuration-environment-variables)).

---

## 5. Install and run with Docker (recommended)

One command starts the database, the API and the web app, runs the migrations and loads the demo data.

```bash
git clone https://github.com/Seyiranky/Capstone.git
cd Capstone
docker compose up --build
```

The first start takes 1–3 minutes. Then open:

| Service | URL |
|---|---|
| **Web app** | http://localhost:5173 |
| API health check | http://localhost:4000/health (expect `{"status":"ok"}`) |
| API base | http://localhost:4000/api |
| PostgreSQL (for pgAdmin, DBeaver) | `localhost:5433`, user `isoko`, password `isoko`, database `isoko_talents_dev` |

Sign in at http://localhost:5173 as `admin@isoko.demo` / `password123`.

### How the containers connect

```text
Browser ──▶ client (Vite, :5173) ──/api, /uploads──▶ server (Express, :4000) ──▶ postgres (:5432, host :5433)
```

The browser cannot reach the service name `server`, so Vite proxies `/api` and `/uploads` to it
inside the Docker network.

### What happens on startup

`server/docker-entrypoint.sh` runs four steps:

1. It waits for Postgres.
2. It runs `npm run migrate`.
3. It seeds the skill categories and demo data. This is skipped if the data already exists.
4. It starts the API with live reload.

The web container waits until the API's health check passes.

### No `.env` needed

The defaults live in `docker-compose.yml`. To change them, create a `.env` file next to
`docker-compose.yml`:

| Variable | Default | Purpose |
|---|---|---|
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | `isoko`, `isoko`, `isoko_talents_dev` | Database credentials |
| `JWT_SECRET` | `dev-jwt-secret-change-me` | Signs sign-in tokens; **change it anywhere real** |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `GOOGLE_CLIENT_ID` | empty | Turns on "Sign in with Google". Add `http://localhost:5173` as an authorised JavaScript origin in Google Cloud Console |
| `SEED_ON_START` | `true` | Seed on start |

### Everyday commands

```bash
docker compose up --build -d            # start in the background
docker compose ps                       # postgres and server should be "healthy"
docker compose logs -f server           # API logs (also: client, postgres)
docker compose exec server npm run migrate
docker compose exec server npm run seed
docker compose exec server sh           # a shell in the API container
docker compose down                     # stop, keep data
docker compose down -v                  # stop and DELETE the database and uploads
```

Two volumes hold the data: `postgres_data` (the database) and `server_uploads` (uploaded files).

### Troubleshooting

| Symptom | Fix |
|---|---|
| `dockerDesktopLinuxEngine` / "cannot find the file specified" | Docker Desktop is not running. Start it and wait for "Engine running" |
| Port already in use (5173, 4000 or 5433) | Stop the other program, or change the host port in `docker-compose.yml`, e.g. `'5174:5173'` |
| Web app loads but every request fails | Check http://localhost:4000/health and `docker compose logs server` |
| Server keeps restarting | Usually Postgres was not ready or a migration failed. Read the logs. A full reset is `docker compose down -v && docker compose up --build` |
| Demo accounts missing | `docker compose exec server npm run seed` |
| Strange `node_modules` errors after pulling | `docker compose build --no-cache server client` |

---

## 6. Install and run without Docker

You need Node 24+ and a running PostgreSQL 16+.

```bash
git clone https://github.com/Seyiranky/Capstone.git
cd Capstone

# 1. Database (any user that can create databases)
createdb isoko_talents_dev

# 2. API
cd server
cp .env.example .env      # then set DB_HOST=127.0.0.1, DB_PORT=5432, DB_USER and DB_PASSWORD
npm install
npm run migrate
npm run seed              # skill categories and demo accounts
npm run dev               # http://localhost:4000

# 3. Web app (second terminal)
cd client
cp .env.example .env      # VITE_API_URL already points at http://localhost:4000/api
npm install
npm run dev               # http://localhost:5173
```

### Production build, locally

```bash
cd server && npm run build && npm start         # compiles to server/dist, runs node dist/server.js
cd client && npm run build && npm run preview   # static files in client/dist, served on :4173
```

When you use the preview, allow its origin on the API: `CORS_ORIGINS=http://localhost:4173 npm run dev`.

### Useful server scripts

| Command | What it does |
|---|---|
| `npm run migrate` / `npm run migrate:undo` | Apply all migrations / undo the last one |
| `npm run seed` | Load skill categories and demo data |
| `npm run reviewers:enrol` | Enrol eligible workers as peer reviewers |
| `npm run trust:backfill` | Recompute every worker's trust score |
| `npm run momo:sandbox-user -- <primary key> collection --write-env` | Create an MTN sandbox API user and write the keys into `server/.env` without printing them |
| `npm run momo:smoke` | Send one sandbox payment request and poll it to SUCCESSFUL |
| `npm run sms:test -- <number>` | Send one test SMS through the configured driver |

---

## 7. Configuration (environment variables)

Every variable is listed with a comment in [`server/.env.example`](server/.env.example) and
[`client/.env.example`](client/.env.example). Copy them to `.env`: real `.env` files are git-ignored
and must never be committed.

### API (`server/.env`)

| Group | Variable | Purpose |
|---|---|---|
| Runtime | `NODE_ENV`, `PORT` | `development` / `test` / `production`; port (default 4000) |
| Database | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_NAME_TEST` | Local connection; the test database defaults to `isoko_talents_test` |
| | `DATABASE_URL` | Production connection string (SSL on; `DATABASE_SSL=false` turns it off) |
| Security | `JWT_SECRET` | **Required**: the server refuses to start without it |
| | `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d` |
| | `PASSPORT_SIGNING_SECRET` | Signs skill passports and income statements. It is kept apart from `JWT_SECRET` because a passport is a long-lived public credential |
| | `CORS_ORIGINS` | Extra allowed web origins, comma-separated |
| | `APP_URL` | The web app's address, used in email links and as the allowed origin |
| Google | `GOOGLE_CLIENT_ID` | Google sign-in (the web app needs the same value as `VITE_GOOGLE_CLIENT_ID`) |
| Payments | `PAYMENT_PROVIDER` | `simulated-momo` (default) or `mtn-momo` |
| | `PAYMENT_WEBHOOK_SECRET` | Shared secret on the payment callback |
| | `MOMO_TARGET_ENV`, `MOMO_BASE_URL`, `MOMO_CURRENCY` | `sandbox` or production; the currency is EUR in the sandbox |
| | `MOMO_COLLECTION_KEY`, `MOMO_COLLECTION_USER`, `MOMO_COLLECTION_API_KEY` | MTN Collections credentials (from `npm run momo:sandbox-user`) |
| | `MOMO_DISBURSEMENT_*` | MTN Disbursements credentials for payouts (optional) |
| | `MOMO_CALLBACK_URL`, `MOMO_WEBHOOK_SECRET` | Public callback; status polling confirms payments even without it |
| SMS | `SMS_DRIVER` | `log` (prints; default) or `pindo` |
| | `PINDO_API_TOKEN`, `PINDO_ENDPOINT`, `SMS_SENDER_ID`, `SMS_WEBHOOK_SECRET`, `SMS_TIMEOUT_MS`, `SMS_LOW_BALANCE_USD` | Pindo settings |
| Email | `EMAIL_DRIVER` | `log` (prints; default), `smtp` or `brevo` (HTTPS API; use this on Render, which blocks SMTP) |
| | `EMAIL_FROM` | e.g. `Isoko <you@example.com>`; must be a sender verified with the provider |
| | `BREVO_API_KEY` | For `EMAIL_DRIVER=brevo` |
| | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | For `EMAIL_DRIVER=smtp` |
| File storage | `STORAGE_DRIVER` | `local` (files in `server/uploads`; default) or `supabase` |
| | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET` | Supabase Storage (a private bucket, default `uploads`) |
| Matching | `RANKED_INVITE_LIMIT`, `EXPLORATION_SLOTS` | How many ranked invitations a new gig sends, and how many places go to newcomers |
| Support | `SUPPORT_GUEST_DAILY_LIMIT`, `SUPPORT_GUEST_HOURLY_LIMIT` | Limits on the signed-out contact form (defaults 10 per email a day, 20 per connection an hour) |
| Seeding | `SEED_DEMO_DATA` | `false` starts a production database empty |

### Web app (`client/.env`)

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | The API base, e.g. `http://localhost:4000/api` or `https://isoko-api.onrender.com/api` |
| `VITE_GOOGLE_CLIENT_ID` | Google sign-in |
| `VITE_SMS_SENDER_NAME` | The sender name users are told to expect texts from |

---

## 8. Testing

Isoko is tested at four levels. The first three run on every push in CI.

| Level | Tool | Size | Result |
|---|---|---|---|
| Unit (server) | Jest | 155 tests, 15 files | all pass |
| Integration (server) | Jest + Supertest against a real PostgreSQL | 440 tests, 45 files: every route, middleware and rule | 594 of 595 pass; one known intermittent test |
| Unit (web) | Vitest | 23 tests: job stages and next actions, offline queue | all pass |
| **End-to-end** | Playwright: the production build, the real API, a fresh database | 16 tests × 4 browser set-ups (Chrome, Safari, Android Pixel 7, iPhone 14) | **64 of 64 pass** |
| Performance | `client/perf/` scripts | API latency at 1, 10 and 25 concurrent requests; page loads on a throttled low-end phone | see [section 9](#9-performance) |

The end-to-end tests found **two real bugs**, both fixed:
- a wrong password showed its error twice;
- a worker's Marketplace tabs pushed the page sideways on an iPhone-sized screen.

Full results, the browser matrix and what each test proves are in
[docs/evidence/testing.md](docs/evidence/testing.md).

### Running the tests

**Server (unit and integration).** You need a test database once:

```bash
createdb isoko_talents_test
cd server
npm run migrate:test
npm run seed:test
npm test                         # all 595
npx jest tests/unit              # unit tests only, no database needed
npx jest tests/integration/payments   # one area
```

The tests always use the simulated payment provider and the `log` SMS, email and storage drivers,
so they never send anything, even when `server/.env` holds real keys.

**Web app (unit):**

```bash
cd client && npm test
```

**End-to-end:**

```bash
cd client
npx playwright install chromium webkit   # once
npm run e2e:chromium                     # quick: desktop Chrome only
npm run e2e                              # every browser and phone
npx playwright show-report               # the HTML report after a run
```

Playwright starts its own API on port 4100 and a production build on port 4174. It uses a separate
database, `isoko_talents_e2e`, that is emptied, migrated and seeded on every run.
[`client/e2e/start-api.sh`](client/e2e/start-api.sh) refuses to reset any database whose name
does not end in `_e2e`, so development data is safe.

**Static checks (as CI runs them):**

```bash
cd server && npm run lint && npm run typecheck && npm run build
cd client && npx eslint src && npx tsc --noEmit -p tsconfig.app.json && npm run build
node scripts/check-i18n-parity.mjs      # English and Kinyarwanda have the same keys
node scripts/check-shared-copies.mjs    # code shared by the API and the web app is identical
```

A manual, per-role test guide with the seeded accounts is in [TESTING.md](TESTING.md).

---

## 9. Performance

| Measure | Before | After |
|---|---|---|
| JavaScript for the first page | 3,632 KB (1,111 KB compressed), one file | 1,724 KB (**558 KB compressed, −50%**), split into 84 files loaded on demand |
| First paint on a low-end phone (4× slower CPU, slow 4G), sign-in | 6.6 s | **3.5 s (−47%)** |
| First paint on a low-end phone, dashboard | 6.9 s | **3.7 s (−46%)** |
| `GET /gigs` response size | 68 KB | **5.8 KB** (gzip) |
| API p95 locally, 25 concurrent requests (slowest endpoint) | | 156 ms (target: 500 ms) |
| API server time live (after the ~286 ms network round trip from Kigali to Frankfurt) | | 6–112 ms |

What changed:
- pages load on first use (`React.lazy`);
- the dashboard chart loads after the page;
- React, Ant Design and the translations are cached apart from the app;
- API responses over 1 KB are gzip-compressed.

The method, the raw JSON results and the tools are in
[docs/evidence/perf/README.md](docs/evidence/perf/README.md). To measure again:

```bash
cd client
node perf/api-latency.mjs --base http://localhost:4000/api
node perf/page-metrics.mjs --web http://localhost:4173 --api http://localhost:4000/api
```

---

## 10. Architecture

```text
             ┌──────────────────────────────┐
             │ Browser / installed PWA      │  React + Redux + Ant Design, EN/RW
             │ isoko-web.onrender.com       │  service worker, offline queue
             └──────────────┬───────────────┘
                 HTTPS JSON │  WebSocket (Socket.IO: messages, notifications)
             ┌──────────────▼───────────────┐
             │ Express API (Node 24)        │  routes → middleware → controllers
             │ isoko-api.onrender.com       │        → services → Sequelize models
             │ background sweep every 10 min│  payments, reminders, disputes, visits
             └──┬─────────┬─────────┬───────┘
                │         │         │  drivers chosen by configuration
      PostgreSQL│   Storage│        │ MTN MoMo · Pindo SMS · Brevo email · Google
     (Supabase) │ (Supabase│        │
                ▼  bucket) ▼        ▼
```

### Layers (server)

| Layer | Folder | Responsibility |
|---|---|---|
| Routes | `server/src/routes/` | 21 routers, about 140 endpoints; URL to handler, with middleware per route |
| Middleware | `server/src/middleware/` | Authentication (JWT), roles (`requireRole`, `requireReviewer`), rate limits, upload checks (magic bytes, size), validation |
| Controllers | `server/src/controllers/` | Read the request, call a service, shape the response |
| Services | `server/src/services/` | Business rules: matching, verification, payments, payouts, completion, disputes, trust, safety, support… |
| Models | `server/src/models/` | 32 Sequelize models over 72 migrations; see [SCHEMA.md](SCHEMA.md) |
| Library | `server/src/lib/` | Drivers (SMS, email, storage), notifications, PDF writer, signed links, HTTP errors |

### Web app

| Folder | Responsibility |
|---|---|
| `client/src/pages/` | 29 pages, each loaded on first use |
| `client/src/components/` | Feature components grouped by area (Admin, Marketplace, Wallet, Verification, Safety…) |
| `client/src/store/` | Redux Toolkit store (the signed-in session) |
| `client/src/api/` | Typed API clients over Axios |
| `client/src/lib/` | Pure logic with tests: job stages, notification kinds, the offline queue |
| `client/src/i18n/` | English and Kinyarwanda translations, checked for parity in CI |

### The job lifecycle

```text
gig posted ─▶ admin approves ─▶ workers invited / apply ─▶ client approves one ─▶ worker confirms
  ─▶ worker: "I've finished" ─▶ client marks done ─▶ client pays (MoMo) ─▶ payment confirmed
  ─▶ payout(s) to worker (and crew/apprentice shares) ─▶ public receipt ─▶ reviews ─▶ trust score updated
```

Either side can call a job off or open a dispute along the way. A payment that MTN has not
confirmed is checked again by the background sweep. A job that is never marked done reminds the
client and can be disputed.

---

## 11. Object-oriented design

| Concept | Where | How |
|---|---|---|
| **Interface + strategy (polymorphism)** | `server/src/services/payments/adapter.ts` | `PaymentAdapter` declares `requestPayment`, `buildCallback`, `normaliseStatus` and an optional `checkStatus`. `SimulatedMomoAdapter` and `MtnMomoAdapter` implement it, and `paymentService` never knows which one it holds. An Airtel adapter would be one new class. |
| The same pattern for channels | `server/src/lib/channels/sms.ts`, `email.ts`, `server/src/lib/storage/` | SMS (`log`, `pindo`), email (`log`, `smtp`, `brevo`) and storage (`local`, `supabase`) drivers behind one interface each, chosen by an environment variable |
| **Inheritance** | `server/src/models/` | Every model extends Sequelize's `Model<Attributes, CreationAttributes>` with typed fields and associations; `User` filters its secret fields (password hash, tokens) out of every read |
| **Encapsulation** | `server/src/lib/pdf.ts` | `PdfDocument` hides PDF byte offsets and the cross-reference table behind `title`, `heading`, `paragraph`, `table` and `toBuffer`; it writes receipts and income statements with no PDF library |
| **Custom error hierarchy** | `server/src/lib/httpError.ts` | `HttpError extends Error` carries an HTTP status. Services throw it, and controllers turn it into a response |
| **Single responsibility** | `server/src/services/` | One service per business area, kept out of the controllers |
| Types shared end to end | `server/src/types/`, `client/src/types/` | Strict TypeScript on both sides |

---

## 12. Algorithms

| Algorithm | File | What it does | Cost |
|---|---|---|---|
| **Weighted match scoring** | `server/src/services/matchScoringService.ts` | Scores each worker for a gig on distance (haversine, halving every 3 km, cut at 15 km), trust, skill fit (verified 1, pending 0.6, unverified 0.4) and availability. The default weights are 0.3/0.3/0.3/0.1 from a stored weight profile. It returns the reasons with the score. | O(n log n) for n workers |
| **Ranked invitations with exploration** | `matchScoringService.ts` (`rankCandidates`), `rankedInvitationService.ts` | Invites the top `RANKED_INVITE_LIMIT` workers, keeping `EXPLORATION_SLOTS` places for newcomers so the ranking does not lock out new workers | O(n log n) |
| **Auditable reviewer draw** | `server/src/services/skillVerificationService.ts` | Removes ineligible reviewers (the worker themselves, past collaborators, disclosed relationships, anyone who already reviewed, too many pairings), keeps the least busy, then draws one with a **SHA-256-seeded deterministic pick**. The seed and every exclusion are recorded, so an auditor can replay the draw. | O(r) for r reviewers |
| **Collusion detection** | `server/src/services/collusionDetectionService.ts` | Flags repeated pairings, decisions under 60 s, and approval rates more than 2 standard deviations from the mean (z-score, at least 5 reviews), plus prior job relationships | O(d) for d decisions |
| **Bayesian trust score** | `server/src/services/trustScoreService.ts` | Shrinks a worker's average rating toward a prior (mean 3.5, strength 3), weights each review by a 180-day half-life decay, and smooths the completion rate (Laplace), so one 5-star review cannot outrank twenty 4.8s | O(k) for k reviews |
| **Rate guidance** | `server/src/services/rateService.ts` | 25th percentile, median and 75th percentile of what jobs in a category **paid**. It falls back to posted budgets with fewer than 3 payments, and says which basis it used | O(m log m) |
| **Eligibility rules** | `server/src/services/applicationEligibility.ts`, `lib/sensitiveGig.ts` | For sensitive gigs, checks the requirements one by one and returns each one that is missing with where to fix it. The same code runs on the API and the web app, and CI keeps the two copies identical | O(1) |
| **Signed credentials** | `passportService.ts`, `incomeStatementService.ts` | Tokens signed with `PASSPORT_SIGNING_SECRET` over a reduced claims summary, so anyone can verify a passport or statement without an account | O(1) |
| **Block randomisation** | `server/src/services/allocationService.ts` | A permuted-block sequence (Fisher–Yates shuffle within each block) assigns pilot participants to study arms, so the arms never drift apart by more than half a block (RQ2) | O(1) per gig |

---

## 13. Repository structure

```text
Capstone/
├── README.md                 this file
├── SCHEMA.md                 database tables, and the reasoning behind them
├── TESTING.md                manual test guide by role
├── docker-compose.yml        local stack: postgres, server, client
├── render.yaml               Render blueprint: API (Docker) and static web app
├── .github/workflows/ci.yml  CI: server, client, end-to-end, image, translations
├── scripts/
│   ├── check-i18n-parity.mjs     English and Kinyarwanda keys match
│   └── check-shared-copies.mjs   shared server/client code is identical
├── docs/
│   ├── DEPLOYMENT.md         step-by-step deployment to Render + Supabase
│   └── evidence/
│       ├── testing.md        test results, browser matrix, bugs found
│       ├── perf/             performance before and after (README + raw JSON)
│       └── momo/             MTN MoMo sandbox payment, with screenshots
├── server/                   Express API (TypeScript)
│   ├── Dockerfile            development image (live reload)
│   ├── Dockerfile.prod       production image (compiled, multi-stage)
│   ├── config/config.js      database settings per environment
│   ├── migrations/           72 Sequelize migrations
│   ├── seeders/              skill categories and demo data
│   ├── src/
│   │   ├── app.ts, server.ts Express app; HTTP + Socket.IO server and the background sweep
│   │   ├── routes/ controllers/ services/ models/ middleware/
│   │   ├── lib/              channels (sms, email), storage, pdf, notify, httpError…
│   │   └── scripts/          operational scripts (MoMo sandbox, seeding, backfills)
│   └── tests/
│       ├── unit/             15 files, no database
│       ├── integration/      45 files, real PostgreSQL
│       └── helpers/
└── client/                   React web app (TypeScript)
    ├── src/                  pages, components, store, api, lib, i18n, theme
    ├── e2e/                  Playwright end-to-end tests
    ├── perf/                 API latency and page-load measurement scripts
    ├── playwright.config.ts
    └── vite.config.ts        build, code splitting, PWA
```

---

## 14. Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and pull request to `main`:

| Job | Steps |
|---|---|
| **Server** | Lint, typecheck, migrate a PostgreSQL 16 service, run all Jest tests (failures become annotations on the run), build |
| **Client** | Lint, typecheck, Vitest, production build |
| **End-to-end** | Builds the web app, starts the API on a fresh database, runs Playwright in Chromium, and keeps the report if anything fails |
| **Production image** | Builds `server/Dockerfile.prod` and, on `main`, pushes it to GitHub Container Registry |
| **Translations and shared code** | English/Kinyarwanda key parity; shared server/client files identical |

---

## 15. Deployment

| Part | Where | Notes |
|---|---|---|
| Web app | Render static site | `npm ci && npm run build`, publishes `client/dist`, rewrites every path to `index.html` |
| API | Render web service, Frankfurt | Built from `server/Dockerfile.prod`. On start it checks `DATABASE_URL`, migrates, seeds if the database is empty, then runs `node dist/server.js` |
| Database | Supabase PostgreSQL, eu-central-1 | Through the session pooler (Render cannot reach Supabase's IPv6-only direct host) |
| Files | Supabase Storage, private bucket | Avatars, evidence, chat photos and voice notes survive redeploys |
| Email | Brevo HTTPS API | Render's free tier blocks outbound SMTP |
| Payments | MTN MoMo sandbox | |
| Keep-awake | cron-job.org | Calls `/health` every 10 minutes |

The whole set-up is in [`render.yaml`](render.yaml). The step-by-step guide, with each secret
named and the problems met on the way, is [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## 16. Privacy and data protection

Isoko follows Rwanda's Law 058/2021 on the protection of personal data:

- A public **privacy page** at `/privacy` (English and Kinyarwanda) says what is kept and why, who sees it, the companies that process it (MTN Mobile Money, Pindo, the email service, Google, the hosting provider), and your rights.
- **Data export**: Settings › Your data downloads everything held about you.
- **Account deletion**: Settings › Your data. You confirm with your password, and deletion is refused while a job is live, a payment is owed or a dispute is open. The account is **anonymised**: name, email, phone, contacts, CV and files are removed and sign-in is blocked. Receipts and payment records stay, because they are financial records.
- Phone numbers are confirmed before any SMS is sent. Users choose channels per category of notice.
- Uploaded private files are served only through signed, expiring links. Uploads are checked by content (magic bytes), not by file name.

---

## 17. Known limitations

- **MTN MoMo runs in the sandbox.** It uses EUR test money and sends no prompt to a real phone. Going live needs an MTN production agreement and a registered business. The code and configuration are ready for it.
- **Airtel Money is not integrated.** The `PaymentAdapter` interface makes it one more class.
- **The SMS sender is Pindo's shared `PindoTest`.** A branded `Isoko` sender needs RURA and operator registration through a registered company.
- **Server notices (SMS, email, in-app) are written in English.** The interface itself is fully bilingual.
- **The live API is on a free tier.** The round trip from Rwanda to Frankfurt (~290 ms) is most of each request's time.
- **One intermittent integration test** ("registers a client and a worker") fails about once in ten runs and passes on re-run. CI now captures its message.
- **Firefox end-to-end runs were not recorded.** macOS blocked the test tool's Firefox. Run `npx playwright test --project=firefox` locally.

---

## 18. Further documentation

| Document | Contents |
|---|---|
| [SCHEMA.md](SCHEMA.md) | Every table and relationship, with the reasons for each design choice |
| [TESTING.md](TESTING.md) | Manual test guide by role, with the seeded accounts |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment to Render and Supabase |
| [docs/evidence/testing.md](docs/evidence/testing.md) | Test strategies, results, browser and device matrix |
| [docs/evidence/perf/README.md](docs/evidence/perf/README.md) | Performance before and after, with raw data |
| [docs/evidence/momo/README.md](docs/evidence/momo/README.md) | A real MTN MoMo sandbox payment, with screenshots |
| Walkthrough video | _VIDEO LINK: to be added_ |
| Technical report | _REPORT LINK: to be added_ |
