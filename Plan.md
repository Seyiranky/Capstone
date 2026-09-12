# Isoko Talents — Differentiating Features Build Plan

## Context

The platform works end-to-end today: register/login → post gig → admin approves → worker
applies → client approves → match → complete → simulated MoMo → review → wallet history.
Admin moderation, real-time 1:1 chat, notification centre, dark mode, ⌘K palette and genuine
Kinyarwanda translation for ~19 screens all function.

But the proposal's three research questions cannot currently be answered by the code, because
the mechanisms they interrogate don't exist:

| RQ | What it asks | Current mechanism |
|---|---|---|
| RQ1 | Verification that **resists worker–reviewer collusion** | One line: `admin.id !== workerId` (self-review only). No rotation, quorum, or audit trail. |
| RQ2 | How to **weight distance against trust** in matching | No matching algorithm at all. `Match.rankScore` is dead schema. |
| RQ3 | Does verification **increase willingness to hire** | Trust score is a flat mean; verification doesn't feed into it. No survey capture. |

Worse, two of the three system-log metrics the evaluation plan depends on are uncomputable:

1. **Match acceptance rate is definitionally 100%.**
   `server/controllers/gigApplicationController.js:94-98` creates every Match with
   `status: 'accepted'`, overriding the model's own `'pending'` default
   (`server/models/Match.js:31`). There is no path by which a match is ever *not* accepted.
2. **Time-to-first-match has no clock start.** Nothing timestamps the `pending_review → open`
   transition in `adminController.reviewGig`.

So the work that differentiates this project is the same work that makes it defensible. The
goal of this plan: make RQ1–RQ3 empirically answerable, and add the context-fit features
(offline/SMS, media evidence, portable passport, income statement) that separate Isoko from
KaziLinks, Huza and Mesee.

---

## Scope verdict — read this first

Seven feature clusters is not shippable solo in the remaining sprints. Recommended cuts:

**Cut to a seam, don't build:** real MTN/Airtel sandbox integration. It answers no RQ, appears
in no evaluation metric, and developer-portal approval is an external blocker you can't
schedule. Build the provider-adapter + webhook + idempotency + fail endpoint driven by the
*simulated* provider — that demonstrates FR-10/NFR-4/NFR-8 defensibly, and a real adapter
drops in later without rework.

**Cut entirely:** email channel, escrow, commission, refunds, server-side PDF generation,
socket presence/typing, mentor-role reinstatement, and the full 65-file i18n sweep. Translate
only pilot-facing screens (Marketplace, MatchList, Verification, Notifications, Profile) plus
**every new explanation string** — those are the artifact being evaluated.

**Descope:** offline → app shell + read caching + queue for *apply* and *mark-read* only.
Queued media upload is the first thing to drop if time slips.

**Non-negotiable:** Sprint 0 metric plumbing, the matching engine, trust decomposition,
collusion resistance, and media evidence capture.

---

## Part 1 — FR/NFR gap audit

As requested, so you can decide per item whether to build or reword the document.

| ID | Claim | Status | Note |
|---|---|---|---|
| FR-1 | Email/password + JWT | ✅ Built | Plus Google OAuth (undocumented bonus) |
| FR-2 | Role + **preferred language** on profile | ⚠️ Partial | Roles yes; `preferred_language` field **does not exist** — i18n is localStorage-only |
| FR-3 | Experience, **CV, certificates** | ❌ Missing | No `experience_summary`/`cv_url`/`certificate_url`. Editable fields are only `['name','bio','locationLat','locationLng']` (`userController.js:11`) |
| FR-4 | Category skill task with evidence | ⚠️ Partial | Evidence is a **pasted URL** only — no file, photo, video or voice |
| FR-5 | Auto-assign to **mentor**, no self-selection | ⚠️ Partial | Works, but reviewers are **admins** — migration `20260813090200` removed the mentor role |
| FR-6 | Mentor review updates trust score | ⚠️ Partial | Review works; **does not** update trust score. `proficiencyLevel` hardcoded to 1 forever |
| FR-7 | Client posts gig | ✅ Built | With image upload |
| FR-8 | **Rank workers by distance + trust** | ❌ **Missing entirely** | No scoring anywhere. `rankScore` never written or read. `locationLat/Lng` never used server-side |
| FR-9 | Match status transitions | ✅ Built | `matchController.js:25-30` |
| FR-10 | **Real** MoMo/Airtel payment request | ❌ Simulated | `simulated-momo`, `MOMO-SIM-` refs, no HTTP client, no credentials |
| FR-11 | Both parties review → trust score | ✅ Built | Trust formula is weak (see Sprint A) |
| FR-12 | **Mentorship** messaging | ⚠️ Reframed | Generic chat only; `/mentorship` redirects to `/notifications`. No mentor model |
| FR-13 | In-app default + **SMS/email opt-in** | ⚠️ Partial | In-app only. No SMS/email providers, no opt-in fields |
| FR-14 | Admin moderation | ⚠️ Partial | Users/gigs yes; `GET /api/admin/flagged` is a hardcoded **501 stub** (`adminController.js:28-30`) |
| NFR-1 | Mobile-responsive, EN + RW | ⚠️ Partial | Translation is genuine and complete (172 keys, real Kinyarwanda) but only **19 of 65** components use it |
| NFR-3 | bcrypt, JWT, env creds | ✅ Built | No `helmet`, no rate limiting |
| NFR-4 | **Idempotent** payment callbacks | ❌ Missing | No callbacks exist at all |
| NFR-5 | CI runs tests on every commit | ❌ Missing | No `.github/workflows/` in repo |
| NFR-6 | Layered architecture | ✅ Built | routes → controllers → services → models, consistently |
| NFR-8 | Retain **provider reference** for audit | ⚠️ Partial | `reference` column exists but is locally generated, not from a provider |

**Also undocumented but built:** Google OAuth, GDPR-style data export
(`GET /api/users/me/export`), ⌘K command palette, saved-gigs bookmarking, dark mode.

**Document-only fixes (no code):** §3.4 already says "payment simulation" and "swapping the
simulated Payment Service for a real MTN MoMo integration in a future phase" — but §1.5,
FR-10 and NFR-4/8 say real. Reconcile to one story. Either reword §1.5/FR-10 to sandbox-seam,
or commit to the integration.

---

## Part 2 — Build plan

### Sprint 0 (≈3 days) — metrics emergency

Do this before any feature work; it changes the schema everything else writes to.

- Migration `add-match-provenance`: `Match.origin` (`'manual'|'ranked'`, default `'manual'`),
  `respondedAt`, `declineReason`, `scoreBreakdown` JSONB, `weightProfileId`.
  `origin` is what separates the manual control arm from the ranked arm in analysis.
- Migration `add-gig-opened-at`: `Gig.openedAt`, set in `adminController.reviewGig` — the
  clock start for time-to-first-match.
- **Stop forcing acceptance**: ranked/invited matches must be born `pending`
  (`gigApplicationController.js:94-98`).
- New `server/services/pilotMetricsService.js` + `GET /api/admin/metrics`: acceptance rate,
  median/mean time-to-first-match, review turnaround — each split by `origin` and weight
  profile. Build now, not at write-up time; it forces the schema to be sufficient.
- **RQ3 has no data-collection path.** Add `SurveyResponse` (userId, promptKey, context JSONB,
  value, createdAt) and a single 1–7 prompt on `GigDetail` for clients, recording whether the
  profile shown was verified.

### Sprint A (weeks 1–2) — trust decomposition + matching engine

**Trust score** — rewrite `server/services/trustScoreService.js`. Use Bayesian shrinkage, not
Wilson (Wilson is a binomial-proportion interval; ratings are 1–5 ordinal, so shrinking a
weighted mean toward a prior is the right tool and explains itself in one sentence):

```
w_i   = 0.5 ^ (ageDays_i / 180)           # 6-month half-life
R     = (Σ w_i·r_i + m·C) / (Σ w_i + C)   # m = 3.5 prior, C = 5 effective reviews
CR    = (completed + 2) / (completed + cancelledByWorker + 4)
V     = min(1, verifiedSkills / 2)
P     = 0.25 · min(1, lateCancels / 3)
score = 5 · clamp(0.55·(R/5) + 0.25·CR + 0.20·V − P, 0, 1)
```

`C = 5` fixes "one 5★ outranks twenty 4.8★". Return `{score, isProvisional, components[]}`
where `isProvisional = reviewCount === 0`, and render "New — no jobs yet" rather than a bare
2.5 — that's the new-vs-terrible distinction the current 0-default destroys.

Persist `User.trustScoreBreakdown` JSONB, `trustScoreUpdatedAt`, `reviewCount`,
`completedJobCount`, `cancelledJobCount`, plus append-only `TrustScoreSnapshots` (score,
components, formulaVersion, createdAt) — your RQ3 time series and the audit behind the
"trust receipt". Recalculate from **three** call sites, not the current one:
`reviewController.createReview`, `matchController.updateMatchStatus` (completed/cancelled),
`skillTaskController.reviewTask` (on approve — closes the FR-6 gap).

**Matching engine** — new `server/services/matchScoringService.js`. **Rank within the existing
flow; do not replace it.** The manual apply→approve path is your only Match source and your
control arm; replacing it destroys comparability. Three insertion points:

1. `applyToGig` — score the (worker, gig) pair onto GigApplication so the review queue is
   ranked and explainable. `origin` stays `manual`.
2. `reviewGig` on approve — compute a ranked shortlist, create top-N Matches as `pending`,
   `origin: 'ranked'`, notify workers. **This is the arm that yields a real acceptance rate.**
3. New `GET /api/gigs/:id/candidates` — ranked candidates with breakdowns.

Components, each normalised to [0,1]:

| Key | Formula | Rationale |
|---|---|---|
| distance | `0.5 ^ (km / 3)` | 0 km→1, 3→0.5, 6→0.25. Tracks moto fare, not linear metres. Hard-exclude >15 km |
| trust | `trustScore / 5` | From above |
| skillFit | verified 1.0 / pending 0.6 / claimed 0.4 / absent 0.0 | Absent blocks *invites* but may still self-apply, scored 0 with a stated reason |
| availability | 0 active matches→1, 1→0.5, ≥2→0 | |

Default weights **0.30 / 0.30 / 0.30 / 0.10** — distance and trust deliberately equal, because
RQ2 asks which matters more and the control arm must not presuppose the answer.

New `MatchWeightProfiles` table seeded `balanced`, `proximity_first` (.50/.20/.25/.05),
`trust_first` (.20/.50/.25/.05). **Every score row stores `weightProfileId` *and* a frozen copy
of the weights JSON**, so historical scores stay reproducible after retuning.

Explainability (this is the demo screen, and the direct answer to the Wood & Lehdonvirta
critique you cite): return `reasons: [{key, params}]` as **i18n keys, not English sentences** —
otherwise Kinyarwanda users see nothing. New
`client/src/components/Marketplace/MatchExplanation.tsx` renders "0.8 km · 4.6 trust from 12
jobs · verified in tailoring" plus a per-component contribution bar. Consume it in
`GigDetail.tsx` (replacing the trustScore-only sort at line 81), `MatchList.tsx` and
`MyApplications.tsx`. New `client/src/components/Profile/TrustReceipt.tsx` for the breakdown.

Also this sprint (cheap, unblocks later work): migration for `preferredLanguage`,
`experienceSummary`, `cvUrl`, `certificateUrl`, `phone`, `smsNotificationsEnabled`,
`emailNotificationsEnabled`; extend `UPDATABLE_FIELDS` at `userController.js:11`; persist
language on login in `client/src/i18n/index.ts`. Closes FR-2 and FR-3.

### Sprint B (weeks 3–4) — collusion resistance (RQ1)

Add a reviewer **capability**, `User.reviewerTier` (`'admin'|'peer'|null`), rather than
reinstating the mentor role. Reason: with 2–3 admins in a 30-person pilot, rotation and
repeat-pairing limits are mathematically impossible and RQ1 stays unanswerable. Enrolling
verified workers (trustScore ≥ 3.5, verified in category) makes the mechanism real. Don't
re-add the `mentor` role — migration `20260813090200` already reversed it, and re-adding churns
auth/roleMiddleware; `reviewerTier` is purely additive.

New tables:
- `SkillTaskAssignments` (taskId, reviewerId, round, status
  `pending|approved|rejected|recused|expired`, confidence 1–5, assignedAt, decidedAt, notes,
  assignmentSeed). Keep `SkillTask.reviewerId` written with the round-1 assignment for
  backwards compatibility. **This table is the "reviewer-assignment distribution" audit your
  evaluation plan names.** `assignedAt` separates reviewer latency from queue latency.
- `SkillTaskAppeals` (taskId, workerId, reason, status, decidedBy) — one appeal per task,
  forcing reassignment that excludes all prior reviewers.

Rewrite `skillVerificationService.js`. Eligible = `reviewerTier != null`, ≠ worker, not a
reviewer of this worker in the last 3 tasks, ≤2 pairings in 90 days, no shared Match history
with the worker, category-competent (peers only). Bucket by pending load, then sample from the
lowest bucket with a **seeded** RNG and log the seed — reproducible and auditable, unlike the
current bare `Math.random()` at line 27.

Quorum via `SkillTask.requiredApprovals` (default 1 → 2-of-3) when: the worker has no verified
skill yet, a prior task of theirs was rejected, or the round-1 reviewer reports
`confidence < 3`. Disagreement escalates to a third reviewer; majority decides; set
`disagreementFlag`.

New `server/services/collusionDetectionService.js` **replaces the 501 stub** at
`adminController.js:28-30`, returning typed flags with evidence numbers: (1) pair co-occurrence
≥ expected + 2σ under a uniform-assignment binomial; (2) reviewer approval rate > 2σ from peer
mean; (3) approval within 60s of assignment (rubber-stamping); (4) prior worker–reviewer gig
relationship. New `client/src/components/Admin/CollusionReport.tsx`, CSV-exportable — **this
report is your RQ1 deliverable.**

Also: set `UserSkill.proficiencyLevel` from a reviewer-supplied level (currently pinned at 1).

### Sprint C (weeks 5–6) — evidence, passport, income

**Media evidence.** Extend the *existing* multer pipeline at `server/middleware/upload.js`
(already working for gig images, served statically from `server/uploads/`) with
`uploadEvidence`: `image/*`, `video/mp4|webm` 25 MB, `audio/webm|mp4|mpeg` 5 MB, into
`uploads/evidence/`. New `SkillTaskEvidences` (taskId, kind `photo|video|voice|link`, url,
mimeType, sizeBytes, durationSec, sha256, capturedAt). Keep `SkillTask.evidenceUrl` populated
with the first item so existing tests and UI survive.

Client: `SkillVerificationForm.tsx` gains `<input type="file" accept="image/*"
capture="environment">` (the reliable path on low-end Android) and `MediaRecorder`/
`getUserMedia` for **voice notes — non-optional, given low-literacy users are in scope and the
current form demands a pasted URL**. Playback in `AdminReviewQueue.tsx`.

**Skill passport.** New `server/services/passportService.js` signs claims with the already-
installed `jsonwebtoken` under a separate `PASSPORT_SIGNING_SECRET`, `jti` checked against a
`SkillPassports` table (userId, token, revokedAt). Public `GET /api/passports/:token` (no auth)
and `GET /api/passports/:token/verify`, which recomputes a `contentHash` from the live DB and
reports `matches: true|false` — real tamper-evidence in ~30 lines. Route `/p/:token` sits
outside the auth shell; QR via `qrcode.react`. Shows verified skills with dates, reviewer
*count* (never reviewer identity), trust receipt, completed jobs. This is the "verifiable,
portable record of competence" §1.2 promises and nothing currently delivers.

**Income passport.** Build separately from `exportMyData` — that endpoint is a GDPR dump, this
is a financial attestation for a lender. New `incomeStatementService` +
`GET /api/users/me/income-statement?from&to&format=json|csv`, aggregating confirmed
Transactions by month and category, signed with the same passport key and carrying a
`verificationUrl`. PDF via browser print stylesheet — no server dependency. Link from
`Wallet.tsx`. This answers §1.2's third sub-problem directly.

### Sprint D (weeks 7–8) — PWA, SMS, payment seam

**PWA** via `vite-plugin-pwa` (Workbox; least code). Manifest + icons in `client/public/`
(currently only `vite.svg`), `theme-color` in `index.html`. Precache the app shell;
`NetworkFirst` for GET `/api/gigs|matches|notifications|users/me`; `CacheFirst` for
`/uploads/*`.

**Offline queue** in `client/src/lib/offlineQueue.ts` using `idb-keyval` — not Background Sync
(Safari gap). An axios response interceptor in `axiosClient.ts` catches network errors on a
whitelist and enqueues with a client-generated `clientRequestId`; replay sequentially on
`online` and at app start.

- **Safe to queue:** apply to gig, mark notification read, profile update, create review — all
  create-once or last-write-wins.
- **Never queue:** `PUT /api/matches/:id/status` (a queued "completed" can race a cancel
  through the state machine at `matchController.js:25-30`), application review decisions
  (admin acting on stale data), any payment call. These show "needs a connection".
- **Conflicts:** 4xx is terminal — surface "this gig was already filled" and drop the item,
  never silently retry. Retry only network errors and 5xx, 5 attempts with backoff, then a
  visible dead-letter list.

Server: `IdempotencyKeys` table + `server/middleware/idempotency.js` on whitelisted POSTs,
replaying the stored response on a repeated key. **The same middleware serves the payment
webhook** — one mechanism, two consumers.

**SMS** through the existing seam: `notify(req, fields, {channels})` in `server/lib/notify.js`
fans out to a new `server/lib/channels/sms.js` (Africa's Talking via global `fetch` — Node 24,
no axios needed), gated on `smsNotificationsEnabled` + `phone`. New `NotificationDeliveries`
(notificationId, channel, status, providerMessageId, error) — you need this to report delivery
success in the pilot. Driver is `log` when `NODE_ENV !== 'production'` so tests never hit the
network. This also finally lets `forgotPassword` stop returning the reset token in the response
body (`authController.js:115-135`).

**Payment seam.** Move existing code verbatim to
`server/services/payments/simulatedAdapter.js`, keeping `'simulated-momo'` and the `MOMO-SIM-`
prefix so both existing tests pass untouched. `paymentService.js` becomes a façade resolving by
`PAYMENT_PROVIDER`; controllers unchanged. Migration adds `providerReference`, `providerStatus`,
`providerRawResponse`, `callbackReceivedAt`, `failureReason`, `payerMsisdn`, `currency`
(default RWF), `platformFeeAmount` (nullable, so escrow later needs no second migration), and a
unique index on `(provider, providerReference)`. Add
`POST /api/webhooks/payments/:provider` (shared-secret header) and
`POST /api/transactions/:id/fail` (currently `paymentService.fail` is unreachable), both
status-guarded by the allow-map pattern already used in `matchController`. Duplicate callback →
`200 {duplicate: true}` with zero state change, satisfying NFR-4.

---

## Decision points — your research design, not engineering

1. **RQ3 measurement.** An in-app verified/unverified A/B on the *same* profile is far stronger
   evidence than a post-hoc survey question, but likely needs an ethics amendment. Your call,
   and it determines the `SurveyResponse` schema.
2. **Weight-profile assignment.** Per-user (between-subject) or switched at pilot midpoint
   (within-subject)? Both are supported; it changes whether the resolver reads `User` or a
   global setting.
3. **Peer reviewers in a 30-person, two-sector sample will often know each other** — which is
   precisely the collusion risk under study. That is arguably your most interesting finding,
   but it needs consent language.
4. **Payments:** commit to the real sandbox, or reword §1.5/FR-10 to match §3.4's
   already-stated "simulated, swappable" framing.

---

## Verification

**Restructure tests before Sprint A ships.** `server/tests/integration/api.test.js` (517 lines,
one sequential narrative) **will break** — its test worker has no verified skill, so scoring
and skill-fit gating change its application path. Don't patch it:

- Extract `server/tests/helpers/factories.js` (users + tokens, gigs, matches) and
  `helpers/db.js` (truncate between suites). Keep `api.test.js` as the happy-path smoke
  narrative, giving its worker a verified skill.
- New unit suites (pure, fast, no HTTP): `unit/matchScoringService.test.js` (table-driven
  lat/lng → expected components; swapping weight profile reorders candidates),
  `unit/trustScoreService.test.js` (0 reviews → provisional; 1×5★ ranks below 20×4.8★; recency
  decay; cancellation penalty), `unit/skillVerificationService.test.js` (repeat-pair exclusion,
  quorum triggers, seeded-RNG determinism), `unit/collusionDetectionService.test.js`.
- New integration: `webhookIdempotency.test.js` (same callback twice → one Transaction, one
  transition), `passport.test.js` (mutate a claim → verify reports mismatch),
  `incomeStatement.test.js`, `offlineIdempotency.test.js`, `pilotMetrics.test.js`.
- Client: add `vitest` for `offlineQueue.ts` and `distance.ts` only.

**End-to-end, per sprint.** The app runs locally without Docker: Postgres via Homebrew on 5432,
`cd server && npm run migrate && npm run seed && node server.js`, `cd client && npm run dev`.
Log in as `emmanuel@isoko.demo` / `password123` (seeded admin) or any seeded worker.

- Sprint 0: post a gig, approve it, confirm `openedAt` is set and `GET /api/admin/metrics`
  returns a non-100% acceptance rate once a ranked match is declined.
- Sprint A: two workers at known distances with different review histories → confirm the
  ranking flips when the weight profile changes from `proximity_first` to `trust_first`, and
  that the explanation panel renders in both EN and RW.
- Sprint B: submit tasks from one worker repeatedly → confirm reviewer rotation excludes repeat
  pairs, and that a seeded pair co-occurrence shows up in the collusion report.
- Sprint C: submit a voice note as evidence, approve it, open the passport URL in a logged-out
  browser, then mutate the underlying skill row and confirm `/verify` reports a mismatch.
- Sprint D: DevTools → Network → Offline, apply to a gig, go back online, confirm exactly one
  application is created; POST the same webhook payload twice and confirm one Transaction.

**Also worth doing in any slack:** `helmet` + `express-rate-limit` in `app.js` (NFR-3), a
GitHub Actions workflow running `npm test` on push (NFR-5 currently claims CI that doesn't
exist), and `limit`/`offset` on list endpoints — all sorting and filtering is in-memory
client-side today, which will not survive a pilot's worth of gigs.
