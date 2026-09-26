# Isoko Talents — Build Plan and Current State

> Last updated 2026-09-26. Sprints 0–D are built, and the backend has since been
> migrated to TypeScript. This file records what exists, why each piece is
> shaped the way it is, what it contributes to RQ1–RQ3, and what is still open.

## Backend TypeScript migration — complete

The server is now TypeScript end to end: **85 files under `src/`, zero
JavaScript**, plus all 16 test files. 219 tests pass, `tsc --noEmit` and
`eslint` are both clean, and CI gates on typecheck and build as well as tests.

Migrations (42) and seeders (6) deliberately stay JavaScript — sequelize-cli
loads them itself and cannot execute `.ts`. They are excluded from the
TypeScript program.

| Decision | Choice |
|---|---|
| Layout | Application code moved to `src/`; `config/`, `migrations/`, `seeders/` stay at the root for sequelize-cli |
| Runtime | `tsc` → `dist/` for production (`npm start`); `tsx` for dev and for the container |
| Strictness | `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` — matching `client/tsconfig.app.json` |
| Tests | ts-jest with diagnostics off; types enforced once by `npm run typecheck` |
| Shared types | None. The client keeps its own copies for now |

**The change that mattered.** `models/index.js` was the stock sequelize-cli
loader — `readdirSync`, `require`, into a bare object with no type — so all 28
call sites doing `const { User } = require('../models')` resolved to `any`, and
a mistyped attribute was a runtime `undefined` rather than an error. It is now
an explicit registry, which is what makes every other type in the codebase
worth anything.

**The JSONB columns now have contracts.** `Match.scoreBreakdown` and
`GigApplication.scoreBreakdown` are typed as `ScoredPair`, the exact return of
`matchScoringService.scorePair`; `User.trustScoreBreakdown` and
`TrustScoreSnapshot.components` are both `TrustBreakdown`. Producer and store
can no longer drift apart silently, which matters because those columns are the
pilot's data.

**Behaviour was held fixed and checked, not assumed.** The ranking order,
reasons and component weights are identical to a snapshot taken before the
migration; acceptance rate is still 0.947. The trust formula was compared
directly against its pre-migration implementation on the same row: the two
differ by 5.6e-11, which is the same order as running either one twice in a
row — clock drift inside the recency decay, not a change in the code.

**What typing found.** Three genuine problems surfaced that no test had caught:

1. **The peer reviewer pool was always empty.** `assignReviewer` selected
   `['id','name','reviewerTier','trustScore','role']` and then filtered on
   `candidate.reviewCount`, which that query never loaded — so every peer was
   rejected as `peerNoTrackRecord` and every review fell to an admin. RQ1's
   mechanism is rotation across *peers*, so this matters beyond tidiness. Fixed
   in its own commit, separate from the behaviour-preserving migration.
2. **Query parameters were never the strings the handlers assumed.** Express
   parses `?id[]=a&id[]=b` into an array and `?id[x]=y` into an object, and
   those went straight into Sequelize `where` clauses. Now rejected at the edge.
3. **`jwt.verify(token, process.env.JWT_SECRET)` could not compile** — the
   secret is `string | undefined`. The server had been booting happily with no
   `JWT_SECRET` and failing only at the first login; `server.ts` now asserts the
   required secrets at start-up.

**Known foot-gun, documented in TESTING.md**: `npm run seed:test` is not
idempotent. A second run duplicates the four skill categories and the suite then
fails looking one up by name. CI is unaffected (fresh database each run).

---

## The three research questions, and where each is answered in the code

| | Question | Answered by |
|---|---|---|
| **RQ1** | Can skill verification resist collusion between a worker and a reviewer? | `services/skillVerificationService.js` — rotation, pairing limits, prior-relationship exclusion, seeded draw; `services/collusionDetectionService.js` — rubber-stamp flags |
| **RQ2** | How should geographic closeness be weighted against trustworthiness? | `services/matchScoringService.js` — five weighted components, four weight profiles, `componentVariance()` for effective influence |
| **RQ3** | Does verified skill-proof raise a client's willingness to hire a stranger? | `services/allocationService.js` — concealed permuted-block arms; `User.experimentArm`; survey `context` |

Everything below exists to make one of those three measurable rather than
asserted.

---

## What is built

### Sprint 0 — make the marketplace measurable

Before this, a match was created already accepted, so acceptance rate was
structurally pinned at 100% and RQ2 had nothing to measure. Matches now carry a
real lifecycle (`pending` → `accepted` / `cancelled`) with `respondedAt`,
`acceptedAt` and `declineReason`, and `MatchList` grew the Confirm/Decline UI
that lifecycle requires. Acceptance rate on the seeded pilot history now reads
**0.947**, not 1.0 — a number that can move.

Trust scoring was a flat unweighted mean, which gave a worker with one 5-star
review the same score as one with forty. `trustScoreService` is now Bayesian
shrinkage toward a prior with recency half-life decay:

```
FORMULA_VERSION       v3-bayesian-2026-09
RECENCY_HALF_LIFE_DAYS 180
PRIOR_MEAN / STRENGTH  3.5 / 3
COMPONENT_WEIGHTS      rating .55, completion .25, verification .20 (worker only)
```

Weights renormalise per role, so a client is not permanently capped by a
verification component they can never earn. Declining a pending invitation is
**not** penalised; only abandoning after `acceptedAt` is. Penalising a decline
would make the acceptance rate RQ2 depends on an artefact of coercion.

### Sprint A — ranked matching with an auditable explanation

`matchScoringService.scorePair` produces five components:

```
distance     0.5 ^ (km / distanceHalfLifeKm)      unknown location → 0.5, never 0
trust        trustScore / 5
skillFit     specificity × levelFit                exact 1.0 | sibling 0.7 | parent 0.5
credentials  credentialStrength                    the provenance tier (see Sprint C)
availability decays with concurrent active matches
```

`skillFit` deliberately carries *fit* only and `credentials` carries
*establishment*, so verification is never counted twice — the double-count was
what confounded component variance in the first RQ2 dry run.

Four weight profiles ship, giving RQ2 its comparison arms:

| Profile | trust | distance | skillFit | credentials | availability |
|---|---|---|---|---|---|
| `balanced` | .25 | .25 | .20 | .20 | .10 |
| `proximity_first` | .15 | .45 | .20 | .15 | .05 |
| `trust_first` | .45 | .15 | .15 | .20 | .05 |
| `credential_first` | .15 | .15 | .20 | .45 | .05 |

Two failures found and fixed here are worth keeping on the record. Components
are built by filtering `Object.entries(weights)` against `raw`, because a weight
key with no matching raw value silently produced `NaN` and a profile missing a
key silently dropped a component. And `rankCandidates` sorts **eligible-first,
then by score** — without it, three unqualified workers (0.576) outranked the
only qualified tailor (0.439) purely on proximity, which is exactly the opaque
behaviour this project criticises.

Every score is explained as i18n **keys plus params**, never a rendered
sentence, so `MatchExplanation.tsx` and `TrustReceipt.tsx` translate into
Kinyarwanda without the server knowing which language it is talking to.

### Sprint B — verification that resists collusion (RQ1)

A worker submits a demonstration task; reviewers are drawn, not chosen:

```
RECENT_TASKS_EXCLUDED    3     no reviewer seen in the worker's last 3 tasks
MAX_PAIRINGS_PER_WINDOW  2     within PAIRING_WINDOW_DAYS = 90
PEER_MIN_TRUST_SCORE     3.5
PEER_MIN_REVIEWS         2     a score resting on the prior is not a track record
```

Every rejection is logged with its reason (`self`, `alreadyReviewed`,
`recentPairing`, `pairingLimit`, `priorGigRelationship`, `notCategoryCompetent`,
`peerTrustTooLow`, `peerNoTrackRecord`), and the draw is a seeded SHA-256 whose
seed is stored on the assignment — so any allocation in the pilot can be
reproduced and defended in a viva.

`PEER_MIN_REVIEWS` exists because the trust floor alone was not a floor: an
unreviewed worker sits at the 3.5 prior and cleared a 3.5 threshold on no
evidence at all.

`collusionDetectionService` flags rubber-stamping, but only for assignments that
carry an `assignmentSeed` — judging seeded fixtures on review speed produced six
false positives.

**When no reviewer is eligible, the submission is kept and admins are
notified** (`PUT /:id/assign?relax=true`). The earlier behaviour destroyed the
worker's evidence, which in a pilot means a participant's effort vanishes.

### Sprint C — competence by provenance, not by badge

Four ascending tiers, each with the strength that enters `raw.credentials`:

| Tier | Established by | Strength |
|---|---|---|
| `self_declared` | The worker says so | 0.15 |
| `document_sighted` | A rotated reviewer looked at the document | 0.50 |
| `peer_reviewed` | An approved demonstration task | 0.80 |
| `work_earned` | ≥3 completed, reviewed gigs in that skill | 1.00 |

`competenceService` recomputes the tier and is **monotonic** — new evidence can
never step a worker down.

The decisive move was *not* a new credentials subsystem: adding `SkillTask.kind`
(`demonstration` | `certificate`) made a certificate sighting inherit rotation,
pairing limits, quorum, escalation and appeals at zero marginal cost. That is
what extends RQ1 from skills to credentials, and
`tests/integration/skillVerification.test.js` passing untouched is the proof
that `kind` never leaked into the assignment path.

**Integrity constraint, load-bearing in the UI copy:** `document_sighted` means
a reviewer *saw* the document. It does not mean the certificate is genuine. The
platform cannot authenticate a TVET award and does not claim to.

The taxonomy grew from 4 flat rows to **4 categories and 22 curated
specialisations** (`Skills.parentId`, `kind`, `sortOrder`; `GET /skills?tree=1`).
Curated, not worker-authored — free tagging would destroy the comparability RQ2
needs.

`Gigs.requiredLevel` is client-declared, optional and a **soft penalty, never a
hard filter**. Only a reviewer-set level counts against it; a self-declared
level 5 scores as level 1 against a client's bar, or `requiredLevel` would mean
nothing.

**The reserved exploration slot** takes the last invitation in the shortlist and
gives it to the best otherwise-eligible worker below the track-record threshold.
Without it the credentials component — the largest of three compounding
newcomer penalties, 0.15 against 0.80 — would bury every new worker and
reproduce the cold-start trap §1.2 of the proposal exists to break. It is tagged
`Match.invitationReason = 'exploration'` and reported separately in the metrics,
because an invitation received by reservation is **not** evidence the ranking
chose them, and pooling the two would contaminate RQ2's ranked-arm acceptance
rate. `EXPLORATION_SLOTS=0` switches it off for a control arm.

**RQ3 allocation.** Arms come from a pre-generated permuted-block list
(`ExperimentAllocations`, mixed block sizes 2 and 4 so block tails cannot be
deduced), claimed under `FOR UPDATE SKIP LOCKED`. The first attempt — simple
alternation — was wrong three ways in a researcher-registered in-person pilot:
it destroyed allocation concealment, it had a count-then-write race, and its
counter was polluted by test accounts. `claimArm` returns `null` when the list
is exhausted; it never invents an arm.

### Sprint D — reaching the phone the worker actually owns

- **PWA / offline-first.** `vite-plugin-pwa` + Workbox. The API is `NetworkFirst`
  with a 5s timeout — a stale gig list that looks live is worse than an honest
  failure, because a worker could apply to something already taken. Uploads are
  `CacheFirst`. Photographs are excluded from the precache: the login background
  alone is 2.8MB, and spending a prepaid bundle on decoration before the worker
  has done anything is indefensible.
- **The offline queue** (`client/src/lib/offlineQueue.ts`) replays only a
  whitelist — apply, respond to a match, mark a notification read, edit profile.
  Payments and admin decisions are excluded by design. A 4xx is terminal and
  goes to dead letters rather than retrying forever. Actions carry `occurredAt`
  and `queuedOffline`, so a decision made in a dead zone keeps its real time.
- **SMS channel** (`server/lib/channels/sms.js`) with a `log` driver by default
  and a `pindo` driver behind config. `notify` fans out to in-app and SMS and
  records a `NotificationDelivery` for **every** attempt, including `skipped` —
  a pilot needs to know what never reached the worker, not only what did.
- **Payments** are a façade over `services/payments/simulatedAdapter.js`.
  Settlement runs through one idempotent `applyCallback` under a row lock, and
  `confirm`/`fail` route through that same path, so the webhook and the manual
  path cannot diverge. `Idempotency-Key` responses are recorded **before** the
  response is sent — recording after meant an immediate retry got a 409 instead
  of a replay.

---

## Current state

```
server   219 tests / 15 suites   eslint clean
client    12 tests               eslint + tsc clean
i18n     en/rw at parity (CI-gated by scripts/check-i18n-parity.mjs)
dev DB   15 users · 29 gigs · 21 matches · 18 confirmed payments · 34 reviews
```

The dev database was cleared of verification debris on 2026-09-13 (28
`@example.com` accounts and 12 test-titled gigs), the RQ3 allocation list was
regenerated, and trust scores and the peer-reviewer pool were rebuilt. Backup at
`scratchpad/isoko_dev_before_cleanup.sql`.

---

## Open decisions

1. **The track-record threshold for the exploration slot.** It currently reuses
   `PEER_MIN_REVIEWS` (2), which keeps one definition of "unproven" across the
   codebase — but the right number for *access* need not be the right number for
   *reviewing others*. Revisit once pilot data exists.
2. **Kinyarwanda copy for the four tier labels.** "Sighted" versus "verified" is
   exactly the distinction that must survive translation, and it is a judgement,
   not a lookup.
3. **Real SMS and payment integration.** Deliberately deferred: the simulated
   adapters keep the pilot runnable without a provider contract. The seam is
   already in place, so switching is a driver swap, not a rewrite.

## Residual risk, accepted

`levelFit` has no floor, so a client setting `requiredLevel: 5` drives a
newcomer's `skillFit` to 0.2. The exploration slot is what keeps them reachable
— if it is ever disabled via `EXPLORATION_SLOTS=0`, inflated level requirements
become a real lock-out again. Watch the `newcomerAccess` metric for it.

The client bundle is ~3.3MB, above Workbox's 2MB default ceiling, which was
raised rather than the feature dropped. It is genuinely too large for a low-end
phone on metered data and wants code-splitting before the pilot.

## Explicitly out of scope

Credential expiry, an issuer registry, OCR, any authenticity check on a
document, a portfolio, per-skill reputation in the match score (display only in
the trust receipt), and worker-authored specialisation tags.

---

## Running it

```bash
# Postgres 18 on 5432
cd server && npm run migrate && npm run seed && npm run dev   # tsx watch src/server.ts
cd client && npm run dev
```

`npm run seed` chains `trust:backfill`, so seeded workers hold scores they have
actually earned rather than a hardcoded 5.00 beside "no reviews yet".

Logins are `<name>@isoko.demo` / `password123` — `emmanuel` admin, `grace` and
`diane` clients, `eric` and `aline` peer reviewers.

For production: `npm run build` emits `dist/`, and `npm start` runs
`node dist/server.js`. The container runs `npm run dev` instead, because
docker-compose bind-mounts `./server` over `/app` and would shadow a `dist/`
built at image time.

Useful scripts: `npm run typecheck`, `npm run trust:backfill`,
`npm run reviewers:enrol`, `npx tsx src/scripts/generateAllocationList.ts`
(re-draws the RQ3 block sequence — only before a pilot starts, never mid-run),
and `node scripts/check-i18n-parity.mjs` at the repo root.
