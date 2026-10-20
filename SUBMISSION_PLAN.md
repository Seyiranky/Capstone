# Isoko — submission plan (final version of the product)

Closes the gaps between what is built, the approved proposal (FR-1..14, NFR-1..8, RQ1..4) and the
"Final Version of the Product" brief (30 points; due Fri 23 Oct 2026, 23:59; attempt 2 is a ZIP).
Written 20 Oct 2026. Each phase is ticked here when done.

## Gaps found (audit of 19 Oct 2026)

Audit of the repo against the approved proposal (FR-1..14, NFR-1..8, RQ1..4) and the "Final
Version of the Product" brief (due Fri 23 Oct; attempt 2 is a ZIP). State at audit: 544/544 server
tests, 13 client tests, lint and typecheck clean, i18n in step, CI green on `edfc451`.

**Deliverables not started**
1. Technical report, PDF, max 5 pages: scope table (planned / purpose / status / evidence),
   functionality, two or more testing strategies with results and what changed, code quality, OOP, algorithms.
2. Walkthrough video, linked from the README; `DEMO.md` (referenced by the README) does not exist.
3. README rewrite: product named Isoko; technical requirements with versions (Node 24, Postgres 16+,
   npm, browsers); links to video and report. Stale today: "simulated payments", "password reset
   returns its token", "no reconciliation", `PAYMENT_PROVIDER` "simulated today", no `MOMO_*`
   variables, missing root `.env.example`, admin@isoko.demo and david not listed.
4. ZIP for attempt 2 from `git archive` (never the working folder: `server/.env` holds live keys),
   plus report and video.

**Scope: planned but missing or changed (each needs building or a written justification)**
| Proposal | Built | Gap |
|---|---|---|
| Mentor role reviews skills (FR-2, FR-5, FR-6) | Peer reviewers (verified workers, `reviewerTier`) and admins, rotated, related reviewers excluded | Peers have **no review screen**: the Dashboard asks for the queue only for admins (`Dashboard.tsx:83`). Every review in the UI is done by an admin, which undercuts RQ1 |
| Mentor discloses a relationship; blind second review (RQ1 method) | Automatic exclusion of prior ties, recusal, two approvals for a first verification, collusion audit | RQ1 evidence must be restated in the report around what was built |
| Mentorship messaging (FR-12) | Messaging only worker↔client and worker↔admin | No mentor messaging; justify (a reviewer–worker channel is a collusion channel) or add a narrow one |
| MTN **and Airtel** sandbox (FR-10) | MTN adapter, tested against a mocked MTN API | No Airtel; MTN sandbox never run live (no `MOMO_*` credentials configured; the app runs `simulated-momo`) |
| SendGrid, Africa's Talking | SMTP/log email, Pindo SMS (live) | Justify the substitution |
| CI builds and publishes images | CI tests and builds | No image publishing (minor) |
| Pilot, 25–30 people, survey for RQ3 | Pilot metrics page | No pilot run yet; survey API removed, so the RQ3 survey needs an instrument |
| Deployed pilot URL (budget) | Local and Docker only | Not deployed |

**Defects found**
- An admin's "Message the client" (Applications, Support person drawer) is refused: `ALLOWED_PAIRS`
  in `messageController.ts` has no client↔admin pair.
- Notifications (in-app, SMS, email) are English only; the server ignores `preferredLanguage` (NFR-1).
- Client Dockerfile on Node 20 while the server and CI use 24.

**Testing, performance and compatibility evidence missing**
- No end-to-end tests in the repo (Playwright checks lived in a scratch folder); no cross-browser run.
- NFR-2 (500 ms) never measured; no load test; no Lighthouse or low-end-device figures.
- One 3.7 MB JavaScript bundle, no code splitting (`lazy()` unused).
- Client unit tests cover only the offline queue.

**Code quality**
- Business logic in controllers against NFR-6: `skillTaskController.ts` (670 lines), `adminController.ts` (584).
- `sensitiveGig.ts` duplicated in server and client; 52 server and 5 client lint warnings.
- No account deletion (Law 058/2021 erasure) and no privacy page.

## Decisions

Owner decisions: mentor-worker messaging and Airtel Money are justified in the report rather than
built (focus on MTN MoMo); evidence is gathered and the report and video script drafted for the
owner to edit, own and record; hosting is Render + Supabase (free); the MTN sandbox key is
obtained by the owner. Throughout: SMS stays on the `log` driver, secrets are never printed or
committed, and each phase is committed on its own and marked done here.

## Phase 1 — Core defects (Tue) — done 20 Oct 2026

### 1.1 Peer reviewers get a review screen, and can recuse (FR-5, FR-6, RQ1)

Found:
- `client/src/components/Dashboard/Dashboard.tsx:83` sends `assignedToMe` only when `role === 'admin'`.
- The review card renders only for admins (`:354`, `:402`).
- The server is already correct:
  - `requireReviewer` in `server/src/middleware/roleMiddleware.ts:20` gates on `reviewerTier`;
  - `listTasks` in `skillTaskController.ts:493` has the reviewer branch;
  - `PUT /skill-tasks/:id/review` takes `decision`, `confidence` and `proficiencyLevel`.

**Client:**
- Add a **"Reviews"** page at `/reviews`. Its nav entry in `navConfig.ts` shows when `profile.reviewerTier === 'peer'`; admins keep `/admin/reviews`.
- The page loads `skillTaskApi.listTasks({ assignedToMe: true })` and renders a `PeerReviewQueue`. That component reuses the evidence display from `components/Verification/AdminReviewQueue.tsx` and `EvidenceViewer.tsx`, but calls `skillTaskApi.reviewTask` (the peer route) with confidence 1–5 and proficiency.
- What the peer sees: the skill, the evidence, notes and the worker's first name only. No contact details; `User` already serializes to the public field set.
- Dashboard: a peer worker gets a "N reviews waiting" tile linking to `/reviews`. The worker's own submissions still use the existing `listTasks()` call.
- Add a sidebar badge count. This follows the pattern of the support, safety and applications counts in `SideNav`.

**Recusal, which implements FR-5's "records whether the mentor discloses a prior relationship":**
- `reviewTask` accepts `decision: 'recused'` with a reason: `knowsWorker`, `conflict` or `notQualified`.
- The assignment is marked `recused`, a status that already exists in `AssignmentStatus`. The reason goes in `notes`.
- The task is then re-assigned through the existing draw: `openRound` and the assignment logic in `skillVerificationService.ts`. The draw already excludes everyone who has seen the task.
- The recusal is recorded and shown in the admin collusion report (`components/Admin/CollusionReport.tsx`) as a disclosure count. That count becomes RQ1 evidence.

**Data and docs:**
- Make sure the demo has a peer with a pending assignment. `scripts/enrolPeerReviewers.ts` exists, and Claudine is a peer.
- Delete the "Known gap" section from `TESTING.md`.

**Tests:** extend `skillVerification.test.ts`:
- a peer lists only their assigned tasks;
- a peer approves or rejects through the peer route;
- recusal re-assigns to a different, eligible reviewer and is audited;
- a non-reviewer gets 403.

### 1.2 An admin can message a client

- In `server/src/controllers/messageController.ts:13`, add `['client', 'admin']` to `ALLOWED_PAIRS`.
- Check the client inbox opens the thread from AdminApplications and from AdminSupport's person drawer.
- Test: admin↔client both ways; client↔client is still refused.

### 1.3 Small fixes

- `client/Dockerfile` moves to `node:24-alpine`, matching the server Dockerfile and CI.
- Clear the 52 server and 5 client lint warnings, for example the `useEffect` dependencies in `DisputesPage.tsx:46`.
- **Duplicated `sensitiveGig.ts`:** keep the two copies (server and client), but add `scripts/check-shared-copies.mjs`. It fails if they differ, mirroring `check-i18n-parity.mjs`, and runs in the CI i18n job. That's cheaper and safer than a shared package across two build systems.

---

**Status: done (20 Oct).** Commits `cb2b110`, `22664bf`, `4740343`.
- 1.2: admin↔client messaging allowed on server and client; `messageRoles.test.ts` (2 tests).
- 1.1: `/reviews` page for peers (sidebar entry and count, Dashboard card), blind to other
  reviewers' verdicts; `PUT /skill-tasks/:id/recuse` with a reason, stored in
  `SkillTaskAssignments.recusalReason` (migration `20261020090000`); reassignment through the
  normal draw; a reviewer who discloses knowing the worker is excluded for that worker from then
  on (`disclosedRelationship` rule); recusals by reason in the integrity audit.
  `reviewerRecusal.test.ts` (7 tests). Checked in the browser with a throwaway peer and worker:
  approve, step aside, reassignment to another peer; throwaway data deleted. TESTING.md updated.
  The Kinyarwanda strings for the page are a draft for the owner to proofread.
- 1.3: lint warnings 52 → 0 (server) and 5 → 0 (client); `scripts/check-shared-copies.mjs` in CI;
  client image on `node:24-alpine` (not built locally: Docker was not running).
- After the phase: 553/553 server tests, 13/13 client tests, build passes, i18n and shared-copy
  checks pass.

## Phase 2 — MTN MoMo sandbox, live (Tue, needs the owner for 10 minutes)

**Yes, it is self-service and quick.**
1. Sign up at momodeveloper.mtn.com and confirm the email.
2. Subscribe to **Collections**. This is instant.
3. Copy the **Primary key from the Profile page**, not the product page.

There is no business approval for the sandbox; that is only needed for production. The sandbox uses test numbers and EUR, so no phone prompt appears.

Steps:
1. Add a `--write-env` flag to `server/src/scripts/momoSandboxUser.ts`. Today it `console.log`s the key, user and API key (lines 41–44). The flag writes `MOMO_COLLECTION_KEY`, `MOMO_COLLECTION_USER` and `MOMO_COLLECTION_API_KEY` into `server/.env` without echoing them. The owner runs `npm run momo:sandbox-user -- <key> collection --write-env` themselves, so the key never enters this chat.
2. Set `PAYMENT_PROVIDER=mtn-momo` and `MOMO_TARGET_ENV=sandbox` in `server/.env`. `MOMO_CURRENCY` defaults to EUR in the sandbox (`mtnMomoAdapter.ts:43`).
3. Callbacks need a public URL. The adapter already confirms by status polling: `paymentService.refreshStatus` and `refreshPending` in the `server.ts` sweep. Once deployed, set `MOMO_CALLBACK_URL` to the public webhook.
4. Add `npm run momo:smoke` (`src/scripts/momoSmoke.ts`). It sends one `requesttopay` to a sandbox test number and polls to SUCCESSFUL. It prints only the reference and the status, and is not run in CI.
5. Run one real job end to end:
   - a client marks the job done and pays;
   - the sandbox approves;
   - a payout and a receipt are issued;
   - the Transaction's `providerReference` is the MTN reference ID (NFR-8).

   Screenshot the admin Payments page and the receipt. That is the RQ4 evidence.
6. Keep `simulated-momo` as the default for tests and CI. `momoPayments.test.ts` already mocks MTN.

---

## Phase 3 — Privacy and account deletion (Wed morning; NFR-7)

- `DELETE /api/users/me` requires the current password and blocks deletion while a job is live, a payment is owed or a dispute is open. It then **anonymises** rather than hard-deletes:
  - name becomes "Deleted user";
  - email, phone, trusted contact, bio, CV and certificate are nulled;
  - the avatar file is removed;
  - status becomes `deleted`.

  Transactions, receipts and reviews are kept, because NFR-8 auditability needs them.
- `status` is validated as a string in `User.ts`, so adding `'deleted'` needs no migration. Login and `verifyToken` refuse it, the way they already refuse suspended accounts.
- Settings › Your data gets a "Delete my account" button with a confirmation, next to the existing `ExportDataButton`.
- A public `/privacy` page in EN and RW covers:
  - what is collected;
  - the processors: MTN MoMo, Pindo SMS, Google sign-in, hosting and storage;
  - retention, export and delete rights;
  - Law 058/2021 and the contact route.

  It is linked from Register, the login footer and Settings.
- Tests: deletion anonymises, keeps the receipts, refuses while a payment is owed, and blocks login afterwards.

---

## Phase 4 — Free deployment (Wed)

**What the project needs:**
- A **long-lived Node process**: Socket.IO, plus a 10-minute background sweep in `server.ts` for payments, disputes, safe visits, application follow-ups and support.
- **Postgres**.
- **Persistent file storage**: avatars, evidence, chat photos, voice notes, job photos, support attachments. Today these live on local disk under `server/uploads`, via `middleware/upload.ts`.
- HTTPS, for the PWA, geolocation and Google sign-in.

**Recommendation: Render (API and static client) + Supabase (Postgres and Storage), Frankfurt / eu-central, the closest regions to Kigali. Both are free, with no card needed.**

Why not the alternatives:
- **Render's free Postgres** expires after 30 days, then is deleted.
- **Neon's free tier** gives 100 CU-hours a month and suspends after 5 minutes idle. The 10-minute sweep would keep waking it, and the budget is borderline.
- **Supabase free** gives a 500 MB database and **1 GB of file storage**, with no compute cap. It pauses only after 7 days of no activity.
- **Render free web services** lose local files and spin down after 15 minutes idle, with about a 1-minute cold start. They get 750 hours a month, which is enough for one always-on service. A free external pinger (cron-job.org on `/health` every 10 minutes) keeps it warm, so graders don't hit a cold start and the sweeps keep running.
- **Render Static Site** is free, CDN-backed and never sleeps.

The steps:
1. **Storage driver (OOP: a new strategy, like the payment, SMS and email drivers).**
   - Add `server/src/lib/storage/{index,local,supabase}.ts`, with an interface `save(key, filePath, mime)`, `read(key)` (a stream) and `remove(key)`. It is chosen by `STORAGE_DRIVER=local|supabase`.
   - The Supabase driver uses the Storage REST API with `fetch`, so there is no new dependency. It works against a private bucket using `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.
   - Multer keeps writing to a temp disk path, so the magic-byte checks (`looksLikeImage` and the others) and the sha256 hashing stay unchanged. After validation, the controllers call `storage.save(...)`.
   - The touch points are already known: `gigController.ts:94`, `messageController.ts:33,74`, `matchController.ts:259,294`, `skillTaskController.ts:124,148,171,175`, `userController.ts:239–257` and `supportService`.
   - URLs keep the form `/uploads/<dir>/<name>`. `app.ts:49` keeps `protectPrivateUploads`, the signed links. Static serving falls back to `storage.read` when the file isn't on local disk.
   - Unit-test both drivers. Supabase is tested with mocked fetch.
2. **Production image.** Add `server/Dockerfile.prod`, a multi-stage build: `npm ci`, `npm run build`, then `node dist/server.js` on `node:24-alpine`. The dev `Dockerfile` keeps running tsx. Add a `render.yaml` blueprint:
   - the API web service from `Dockerfile.prod`, with pre-deploy `npm run migrate`, health check `/health`, region Frankfurt;
   - the static site from `client/` (`npm ci && npm run build`, publish `dist`, SPA rewrite `/* → /index.html`, `VITE_API_URL=<api>/api`).
3. **Configuration.** The owner pastes the secrets into the dashboards. They are never printed here.
   - `DATABASE_URL` is the Supabase pooled connection string. `config/config.js` already reads it with SSL.
   - `JWT_SECRET` and `PASSPORT_SIGNING_SECRET` are newly generated.
   - `APP_URL` is the static-site URL, used for CORS and sockets.
   - `PAYMENT_PROVIDER=mtn-momo` with the MoMo sandbox variables and `MOMO_CALLBACK_URL`.
   - `SMS_DRIVER=log`.
   - `EMAIL_DRIVER=log` to start. Brevo SMTP is optional later.
   - `STORAGE_DRIVER=supabase`.
   - Add the production origin to the Google OAuth client's JavaScript origins.
4. **Seed once:** `npm run seed`. It is a fresh database, so the dev data is untouched.
   - With the email and SMS drivers on `log`, new sign-ups can't confirm a contact. Graders use the demo accounts, which are already confirmed; the README says so.
5. **Pinger:** cron-job.org hits `/health` every 10 minutes.
6. **Smoke test on the live URL:** the three roles, an upload that survives a redeploy, a socket chat message, and a MoMo sandbox payment with its callback.
7. **CI:** add a job that builds `Dockerfile.prod` and pushes it to GHCR on `main`. This is the proposal's "builds and publishes container images".

---

## Phase 5 — Performance (Wed afternoon)

- **Code splitting:**
  - In `client/src/App.tsx`, 47 static imports become `React.lazy` for every page and admin screen. The login and register pages stay eager. Add a `Suspense` fallback using the existing skeletons.
  - In `client/vite.config.ts`, add `build.rollupOptions.output.manualChunks` to split out antd, the chart library, react and i18n.
  - Record the bundle sizes **before and after**. Today the main chunk is 3,682,958 bytes.
- **Measure NFR-2 (500 ms):**
  - Add `scripts/perf/api-latency.mjs`, a dependency-free load script using Node fetch. It logs in once, then runs N requests at concurrency 1, 10 and 50 against standard endpoints: `/api/gigs`, `/api/users/me`, `/api/notifications`, `/api/matches`, `/api/users/directory`.
  - It reports p50, p95 and p99 and the error rate, in a table written to `docs/evidence/perf/api-latency.md`.
  - Run it locally and against the deployment.
- **Page performance:**
  - Add `scripts/perf/page-metrics.mjs`, using Playwright and CDP.
  - It loads the login page and the dashboard as each role, under a desktop profile and a **low-end profile**: CPU throttling 4×, a slow-4G network, and a 360×740 viewport.
  - It records FCP, LCP, DOMContentLoaded, transferred JS and the JS heap. Run it before and after code splitting.
  - That before/after is the brief's "improvements made" evidence.

---

## Phase 6 — Testing evidence (Thu)

1. **End-to-end tests, committed (`e2e/` at the repo root, `@playwright/test`).**
   - `playwright.config.ts` defines the projects: chromium, firefox, webkit, Pixel 7 and iPhone 14.
   - `webServer` starts the API on :4100 against a dedicated `isoko_talents_e2e` database (migrated and seeded by `npm run e2e:setup`) and runs `vite preview`. The dev and test databases are never touched.
   - Specs:
     - log in per role, plus a wrong password (error shown);
     - a worker applies to a gig and the client approves;
     - an ineligible worker sees the requirements (sensitive gig);
     - a peer reviews a skill;
     - the client pays (simulated adapter) and a receipt is issued;
     - switching EN/RW persists;
     - gig-form validation errors;
     - SOS from a job card reaches the admin's Safety page.
   - Run it with `npx playwright install firefox webkit` (the npm registry is reachable).
   - Add a chromium-only E2E job to CI.
2. **Client unit tests (vitest)** for the pure libraries:
   - `lib/notificationKind.tsx` (`kindOf`, `dayGroup`);
   - `lib/sensitiveGig.ts`;
   - `utils/apiError`;
   - the avatar crop maths;
   - the offline-queue suite that already exists.
3. **Compatibility matrix.** The automated matrix is 3 engines × desktop/mobile from the E2E run. To that, the owner adds real devices: the Mac with Safari and Chrome, and an Android phone with Chrome. A checklist goes in `docs/evidence/compatibility.md`.
4. **Usability check (optional, owner-led; strengthens the rubric).** 3–5 people do 3 tasks each and fill in a SUS questionnaire. The template goes in `docs/evaluation/`, together with the RQ3 paired-willingness survey instrument (the survey API was removed). The full 25–30-person pilot is written up as the next phase, per proposal Ch. 5.
5. Collect the evidence in `docs/evidence/`: test-run outputs with counts, the CI run link, coverage from `jest --coverage` for the server, and the perf tables.

---

## Phase 7 — Code quality (Thu)

- **Thin `skillTaskController.ts` (670 lines).**
  - Move `openRound`, `submitTask`, `settleTask`, `reviewTask`, `adminDecide` and `appealTask` logic into `services/skillTaskService.ts`. The controller then only parses requests and maps errors, using `lib/httpError.ts`.
  - Recusal (1.1) lands in the service.
- **Thin `adminController.ts` (584 lines).** Group its handlers by area into services: gig moderation, users, payments overview and metrics. `pilotMetricsService.ts` already exists; reuse it.
- Keep behaviour identical: the 544 tests are the safety net, and they run after each move.
- **`docs/ARCHITECTURE.md` for the report and graders.** It covers:
  - the layering;
  - the OOP map:
    - the `PaymentAdapter` interface (`services/payments/adapter.ts`) with its simulated and MTN implementations;
    - the SMS and email drivers;
    - the new storage driver;
    - the Sequelize model inheritance;
    - the PdfDocument class;
    - HttpError;
  - the algorithms, each with a file path and its complexity:
    - weighted match scoring with haversine distance (`matchScoringService.ts`);
    - the seeded deterministic reviewer draw and its exclusion rules (`skillVerificationService.ts`);
    - collusion detection;
    - trust score with shrinkage and time decay;
    - p25/median rate guidance (`rateService.ts`);
    - application eligibility;
    - burst detection.
- Rename "Isoko Talents" to "Isoko" in the `Plan.md` title, `TESTING.md` and `SCHEMA.md`.

---

## Phase 8 — Bilingual notices (Thu, as time allows; NFR-1)

- Add a migration giving `Notifications` a `key` (string) and `params` (JSONB).
- Add `server/src/lib/notices.ts`, a catalogue `{ key: { en: {title, body}, rw: {title, body} } }` with interpolation.
- `notify()` in `lib/notify.ts` accepts `{ key, params }` and renders in the recipient's `preferredLanguage` for in-app, SMS (`smsText`) and email (`email.render`). The old `{title, body}` callers keep working.
- In the client, `kindOf` (`lib/notificationKind.tsx`) prefers `n.key` and falls back to the title regex. Otherwise translated titles would break the classification.
- Convert the call sites that go by SMS and email first: the `outcome` and `critical` categories (payments, approvals, SOS, disputes, support replies). Convert the rest of the ~50 as time allows.
- The owner proofreads the Kinyarwanda.
- Tests: an RW user gets an RW in-app notice and an RW SMS body; an EN user is unchanged.
- **If Thursday runs out,** the unconverted call sites are listed as a limitation in the report.

---

## Phase 9 — README, report draft, video script, ZIP (Thu evening to Fri)

- **README rewrite.** It covers:
  - the overview and features;
  - the **technical requirements**: Node ≥24, npm 10+, PostgreSQL 16+, Docker Desktop (optional), and the supported browsers;
  - a quick start with Docker and without it;
  - the environment variables, including `MOMO_*`, `STORAGE_DRIVER` and `SUPABASE_*`;
  - the demo accounts, including admin@isoko.demo;
  - the live URL;
  - testing commands (unit, integration, e2e, perf);
  - the repository structure, with links to the docs;
  - the video and report links.

  Remove the stale claims: "simulated payments", "reset returns token", "no reconciliation", the missing root `.env.example` (create it) and `DEMO.md` (create it). Add a CI badge.
- **`DEMO.md` video script** (about 12–15 minutes), mapped to brief sections A–E:
  - the core flows by role;
  - the technical logic, explained over the code:
    - ranking breakdown;
    - reviewer draw;
    - eligibility;
    - MoMo sandbox call and callback;
  - different inputs and errors;
  - two or more testing strategies (integration/unit, E2E cross-browser, performance), with results and the fixes they led to;
  - performance and compatibility numbers.
- **Report draft** (≤5 pages), in `docs/report/report.html`, rendered to PDF with Playwright's `page.pdf()`. The owner edits it. It covers:
  1. the scope-alignment table: every FR, NFR and RQ instrument with intended purpose, status (completed, partial or not implemented) and evidence (repo path or screenshot);
  2. the justified deviations:
     - mentor → peer reviewers;
     - disclosure → automatic exclusion plus recusal;
     - no mentor messaging, because reviewer anonymity is the anti-collusion design and apprentice seats cover mentorship;
     - Airtel out of scope, because the adapter interface makes it drop-in and sandbox access needs approval;
     - Pindo instead of Africa's Talking, SMTP instead of SendGrid;
     - escrow tried and then dropped;
     - the pilot is the next phase;
  3. the technical functionality;
  4. the testing strategies and results;
  5. performance and compatibility;
  6. code quality, OOP and algorithms.
- **ZIP (attempt 2):**
  - `git archive --format=zip HEAD`, plus the report PDF and the video file;
  - check that the ZIP contains no `.env` and no `node_modules`;
  - the owner uploads the video (YouTube unlisted or Drive, viewable by anyone with the link) and adds the link to the README.

---

## Schedule

| Day | Work |
|---|---|
| Tue 20 | Phase 1; Phase 2 once the owner has the MTN key |
| Wed 21 | Phase 3; Phase 4 (owner creates Render, Supabase and cron-job.org accounts); Phase 5 |
| Thu 22 | Phase 6; Phase 7; Phase 8 as time allows; README |
| Fri 23 | Report draft by midday; owner edits and records the video; ZIP; submit by evening, not at 23:59 |

Each phase:
- is committed on its own;
- is ticked as done in this file;
- is checked in the browser with throwaway accounts, deleted afterwards.

## Verification

- **After every phase:**
  - server: `npm run lint && npm run typecheck && NODE_ENV=test npx jest --runInBand && npm run build`;
  - client: `npx eslint src && npx tsc --noEmit -p tsconfig.app.json && npm test && npm run build`;
  - `node scripts/check-i18n-parity.mjs` and the new shared-copy check.
- **Phase 1:** in the browser as Claudine (peer): see the queue, approve one task, recuse from another and confirm it was re-assigned. As an admin, message Grace from Applications.
- **Phase 2:** `npm run momo:smoke` reaches SUCCESSFUL. The UI flow produces a Transaction with the MTN reference, a payout and a receipt.
- **Phase 4:** on the live URL, as all three roles: upload an avatar, redeploy, and the avatar is still there; a chat message arrives live; a MoMo sandbox payment completes; `/health` is 200; CI pushes the image to GHCR.
- **Phases 5–6:**
  - before/after bundle size and page metrics are recorded;
  - API p95 is measured against the 500 ms target;
  - `npx playwright test` is green on chromium, firefox and webkit, desktop and mobile;
  - CI is green, including the E2E job.
- **Phase 9:**
  - open the README links from a signed-out browser;
  - unzip the archive into a clean folder, follow the README quick start, and confirm the app runs and the tests pass.
