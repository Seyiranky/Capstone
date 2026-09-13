# Isoko Talents — Credentials & Provenance Build Plan

> Supersedes the earlier four-sprint plan, whose Sprints 0–C are now built and committed
> (160 tests passing). Sprint D — offline PWA, SMS channel, payment seam — remains outstanding
> and is deferred behind this work.

## Context

Workers currently have almost no way to show what they can do. A worker's entire
self-description is a bio and a location dropdown. Registration captures no competence at all.
Four things are broken or missing, and the first is debt I introduced:

1. **FR-3 is a promise with no delivery.** `User.experienceSummary`, `cvUrl`, `certificateUrl`
   and `phone` exist as columns and sit in the `UPDATABLE_FIELDS` allowlist
   (`server/controllers/userController.js:11-23`), but no UI writes them and no logic reads
   them. `experienceSummary` is serialised into the public profile and rendered by nothing.
2. **`proficiencyLevel` is dead in matching.** Reviewers set it (Sprint B), the passport shows
   it, but `matchScoringService` never reads it — `SKILL_FIT_BY_STATUS` is a pure status
   lookup, so a level-5 and a level-1 verified worker rank identically.
3. **The skill vocabulary is four rows.** A tailor doing bridal wear is indistinguishable from
   one doing school uniforms, which caps how much resolution matching can ever have.
4. **Certificates have nowhere to live.** A worker with a real TVET certificate or trade
   membership cannot record it.

Collecting CVs and certificates is table stakes. The contribution is that **every competence
claim carries its provenance, provenance determines how much it counts in ranking, and
credentials are established by the same collusion-resistant rotation that already governs
skills** — so a certificate is not "verified by the platform" but "sighted by a reviewer the
worker could not have chosen". That extends RQ1 from skills to credentials, gives RQ3 a real
manipulation, and operationalises Corten et al. on signal credibility instead of merely citing
it.

## Decisions taken

| Decision | Choice |
|---|---|
| Scope | Credentials core only. No portfolio, no per-skill reputation in the score. |
| Self-declared skills | Score a small nonzero value, labelled as self-declared |
| RQ3 | Between-subjects provenance experiment, assignment column built in from the start |
| Per-skill reputation | Display only in the trust receipt; the match component stays global |
| `Gigs.requiredLevel` | Client-declared on the job post, optional, defaults unset |
| Newcomer lock-out | A reserved exploration slot in the invitation shortlist |
| Self-declared level vs `requiredLevel` | Does not count — only reviewer-set levels are measured against a client's bar |
| Newcomer access | Tracked as a pilot metric, split by arm |

### Why a reserved slot, and not just a softer level field

The level field is real but it is the *smallest* of three compounding penalties. Modelling a
newcomer against an established worker at the same location under balanced weights:

| Component | Newcomer | Established | Gap |
|---|---|---|---|
| trust | 0.51 (provisional) | 0.85 | 0.085 |
| **credentials** | 0.15 (self-declared) | 0.80 (peer-reviewed) | **0.130** |
| skillFit, `requiredLevel` unset | 0.76 | 0.94 | 0.036 |
| **Total** | **0.57** | **0.82** | **0.25** |

Setting `requiredLevel: 3` costs the newcomer a further 0.085. So **the credentials component
this plan introduces is itself the largest newcomer penalty**, and even with `requiredLevel`
left unset a newcomer sits ~30% behind and never reaches a three-slot shortlist.

Nothing hard-excludes them: `applyToGig` is not gated by score, and `eligibleForInvite` only
requires `fit > 0`. The lock-out is purely the `.slice(0, limit)` cut in
`inviteRankedCandidates`. Two consequences make this worth solving properly rather than by
loosening the level field:

- **It deepens a trap the platform exists to break.** Trust ← reviews ← completed jobs ←
  selection ← ranking ← trust. Credentials adds a second locked loop, since `work_earned`
  requires ≥3 completed gigs in the skill. §1.2's stated problem is that "every new client
  relationship has to be built from zero trust"; a matching engine that buries newcomers
  reproduces it.
- **It would hollow out the pilot.** Over 4–6 weeks most of ~25 participants are newcomers most
  of the time. A ranked arm that keeps inviting the same four established workers gives RQ2 data
  from a handful of people, and gives everyone else "I signed up and nothing happened".

---

## The organising idea

Four ascending provenance tiers, each with a strength used by the ranking:

| Tier | Established by | Strength |
|---|---|---|
| `self_declared` | Worker says so | 0.15 |
| `document_sighted` | A rotated reviewer looked at a photo of a paper certificate | 0.50 |
| `peer_reviewed` | An approved demonstration task | 0.80 |
| `work_earned` | ≥3 completed, reviewed gigs in that skill | 1.00 |

The decisive engineering move is **not** a new Credentials subsystem. It is adding `kind` to
`SkillTask`. A certificate sighting becomes a skill task of kind `certificate` and inherits
rotation, repeat-pairing limits, prior-gig exclusion, the seeded reproducible draw, quorum,
low-confidence escalation and appeals from `server/services/skillVerificationService.js` at
zero marginal cost.

**Integrity constraint, non-negotiable in the UI copy:** `document_sighted` means a reviewer
saw the document. It does **not** mean the certificate is genuine — the platform cannot
authenticate a TVET award. Overclaiming here is the failure mode that would not survive a viva.

---

## Phase 1 — Taxonomy, level, and experience (Sprint 1)

**Skill hierarchy.** Migration adds `Skills.parentId` (self-FK, nullable), `Skills.kind`
(`category` | `specialisation`), `Skills.sortOrder`; model gains `belongsTo(Skill, {as:'parent'})`
and `hasMany({as:'children'})`. Seed 5–7 curated specialisations per category — curated, not
worker-authored, because free tagging destroys the comparability RQ2 needs. `skillController.listSkills`
gains `?tree=1`; the existing flat response is preserved so `GigForm` and `SkillVerificationForm`
keep working untouched.

**Separate fit from establishment.** Today `skillFit` conflates "does this worker do this
work" with "is it verified". Split them, which also protects component variance — the exact
problem that confounded RQ2 before:

```
raw.skillFit    = specificity × levelFit          // how well the worker matches the need
  specificity   : exact specialisation 1.0 | sibling under same parent 0.7 | parent only 0.5 | absent 0
  levelFit      : gig.requiredLevel ? min(1, effectiveLevel / requiredLevel) : 0.7 + 0.06 × level

raw.credentials = credentialStrength              // how well established the claim is
```

`verificationStatus` therefore moves *out* of `skillFit` and into `credentials`, so nothing is
counted twice.

**`Gigs.requiredLevel`** (nullable, 1–5) is client-declared on the job post and defaults unset.
It is a **soft penalty, never a hard filter** — filtering hides workers and reproduces the
opacity this project criticises.

**`effectiveLevel` is reviewer-set level only.** A self-declared level is displayed and still
contributes through the `levelFit` branch when no `requiredLevel` is set, but counts as 1 when
measured against a client's bar. Without this, a worker awards themselves level 5, clears every
bar, and `requiredLevel` means nothing — `proficiencyLevel` being reviewer-set is the only
reason it carries information at all.

**Experience intake, voice-first.** `ProfileEditor.tsx` gains an experience section writing
`experienceSummary` (already allowlisted — no server change) plus a new `yearsExperience` int.
Extend `UpdateProfilePayload` in `client/src/api/userApi.ts`, which currently admits only
`{name, bio, locationLat, locationLng}` and is what makes the other fields unreachable. Render
it in `WorkerProfile.tsx`'s right column under the already-reserved, currently-unrendered
`profile.experience` i18n key. Many of these workers have no CV and no digital documents, so
reuse the `MediaRecorder` voice capture from `EvidenceCapture.tsx` — a spoken account of past
work is more reachable than a textarea.

**Critical files:** `server/models/Skill.js`, `server/services/matchScoringService.js`,
`server/controllers/skillController.js`, `client/src/components/Settings/ProfileEditor.tsx`,
`client/src/components/Profile/WorkerProfile.tsx`.

---

## Phase 2 — Credentials through the rotation (Sprint 2)

**Schema.** `SkillTasks.kind` (`demonstration` default | `certificate`), `SkillTasks.claim`
JSONB (`{title, issuer, issuedOn}`), backfilling existing rows to `demonstration`.
`UserSkills` gains `provenance`, `provenanceDetail` JSONB, `credentialStrength` FLOAT,
`selfDeclaredAt` — denormalised deliberately, because matching reads it per candidate and must
not fan out queries.

**Uploads.** Add a `document` entry to `EVIDENCE_LIMITS` in `server/middleware/upload.js`
(PDF plus the existing image mimes, 8MB); `evidenceKindFor`/`evidenceLimitFor` pick it up
automatically. Add `document` to `SkillTaskEvidence.kind`'s validator. Note the ambiguity: a
JPEG can be a photo of work or a photo of a certificate, so the **client must send an explicit
`evidenceKind[]` the controller trusts over mime sniffing**.

**New `server/services/competenceService.js`**, modelled on `trustScoreService.recalculate`:
recomputes `provenance`, `provenanceDetail` and `credentialStrength` for a `(userId, skillId)`
pair, called from the same two places that already call `trustScoreService.recalculate` —
`skillTaskController.reviewTask` on approval, and `matchController.updateMatchStatus` on
completion. Tier must be **monotonic**: adding evidence can never lower it.

**Self-declaration** creates a `UserSkill` at `unverified`/`self_declared`, which is the
competence capture missing from registration today. Surface it as a new onboarding step object
in `Dashboard.tsx:116-155` and a new `Settings` tab (a one-line `items` push).

**The fifth score component.** `raw.credentials` enters `scorePair`, with a reason key per tier.
`MatchExplanation.tsx` needs **no change** — it renders whatever components and reason keys the
server emits, which is why the explainability work pays off here.

> **Sharp edge:** `scorePair` builds components via `Object.entries(weights)`, so a profile
> missing the new key silently drops a component and a profile carrying a key absent from `raw`
> yields `NaN`. The migration must rewrite **all three seeded `MatchWeightProfiles` and
> `FALLBACK_PROFILE` in the service together**, and `scorePair` should skip weight keys with no
> corresponding `raw` value. Suggested balanced weights:
> `{distance .25, trust .25, skillFit .2, credentials .2, availability .1}`. Add a fourth
> profile, `credential_first`, to give RQ2 another comparison arm.

**The reserved exploration slot.** In `inviteRankedCandidates`
(`server/controllers/adminController.js`), the shortlist is currently
`filter(eligibleForInvite).slice(0, limit)`. Change it to: take the top `limit - 1` by score,
then fill the last slot with the highest-scoring *otherwise-eligible* worker below a
track-record threshold (`reviewCount < PEER_MIN_REVIEWS`, reusing the constant already exported
from `skillVerificationService`), if any exists and is not already in the list. If none exists,
the slot falls back to the next-ranked worker so invitations are never wasted.

Two things this must not do. It must not reorder the earned slots — exploration takes the last
slot, never displaces a better-ranked worker from an earlier one. And it must be **visible in
the data**: add `Match.invitationReason` (`ranked` | `exploration`), because an invitation the
newcomer received by reservation is not evidence that the ranking chose them, and RQ2's ranked-arm
acceptance rate would be contaminated if the two were pooled. `pilotMetricsService` must split
acceptance by `invitationReason` as well as by `origin`.

`EXPLORATION_SLOTS = Number(process.env.EXPLORATION_SLOTS ?? 1)`, read per call like
`rankedInviteLimit()`, so the mechanism can be switched off for a control arm without a restart.

**Newcomer access metrics.** `pilotMetricsService.collect` gains a `newcomerAccess` block:
share of invitations and of accepted matches going to workers below the track-record threshold,
split by arm and by `invitationReason`, plus a count of newcomers who have received no
invitation at all. This is what lets a starved pilot be detected in week two rather than in the
write-up, and it converts a fairness risk into a reportable finding.

**RQ3 experiment arm.** `User.experimentArm` (`provenance` | `plain`, nullable), assigned at
registration for clients. In the `plain` arm the UI shows a bare verified/unverified tag; in
`provenance` it shows the full tier labelling. The existing `willingnessToHire` survey prompt
(`server/controllers/surveyController.js`) already accepts a `context` object — record the arm
there. This must ship with Phase 2, not later: retrofitting the assignment loses the data.

**Critical files:** `server/controllers/skillTaskController.js`,
`server/services/skillVerificationService.js` (read-only — it should need no change, and if it
does, `kind` has leaked into the assignment path), `server/services/matchScoringService.js`,
`server/models/UserSkill.js`, `client/src/components/Verification/EvidenceCapture.tsx`.

**Client work.** Lift `accept`, `max` and label keys out of `EvidenceCapture.tsx` into optional
props with defaults preserving current behaviour — do not fork it; the mic-cleanup-on-unmount
and `capture="environment"` behaviour are worth keeping. Add a `document` branch to
`EvidenceViewer.tsx`. New `client/src/components/Verification/CredentialForm.tsx` wraps both.

---

## Explicitly cut

- **`cvUrl` / `certificateUrl` as user-editable URL fields.** Leave the columns (the data export
  references them) but stop advertising them. A URL field for a population without digital
  documents is proposal theatre; certificate sighting replaces it honestly. Reword FR-3.
- **Credential expiry, issuer registry, OCR, any authenticity check on the document.**
- **Portfolio and per-skill reputation in the score** — deferred by the scope decision. Per-skill
  reputation appears in `TrustReceipt` as display only.
- **Worker-authored specialisation tags.**
- **Certificate-specific quorum tuning** — inherit `requiredApprovalsFor` unchanged.

## Decision points still open

1. **The track-record threshold for the exploration slot.** Reusing `PEER_MIN_REVIEWS` (2) keeps
   one definition of "unproven" across the codebase, but the right number for *access* may not be
   the right number for *reviewing others*. Worth revisiting once pilot data exists.
2. **Kinyarwanda copy for the four tier labels** is a translation judgement, not a lookup.
   Budget real time — "sighted" versus "verified" is precisely the distinction that must survive
   translation.

## Residual risk, accepted

There is no floor on `levelFit`, so a client setting `requiredLevel: 5` drives a newcomer's
`skillFit` to 0.2 and their earned ranking close to the bottom. The exploration slot is what
keeps them reachable, so if that mechanism is ever disabled via `EXPLORATION_SLOTS=0`, inflated
level requirements become a real lock-out again. Watch the `newcomerAccess` metric for it.

---

## Verification

**Tests that will break, and why — fix these first, do not patch around them.**

- `tests/unit/matchScoringService.test.js`: every absolute-total assertion moves once a fifth
  component exists, and fixture profiles lacking `credentials` drop a component silently.
  Harden `scorePair` against missing keys, then update fixtures. Add cases for exact vs sibling
  vs parent fit, level-5 vs level-1 both verified now differing, and unset `requiredLevel` being
  neutral.
- `tests/integration/rankedMatching.test.js`: ordering and totals shift.
- `tests/integration/skillVerification.test.js` **should keep passing untouched**. If it does
  not, `kind` has leaked into the assignment path and the RQ1 claim is compromised.

**New coverage.** `tests/integration/credentials.test.js` mirroring `skillEvidence.test.js`:
submit a certificate → assert a reviewer was assigned by the *same* rotation (check the
assignment row carries a seed and an eligible pool size) → approve → assert `provenance` moves
to `document_sighted` and `credentialStrength` rises. `tests/unit/competenceService.test.js`
for tier precedence and monotonicity.

For the exploration slot, in `rankedMatching.test.js`: seed several established workers plus one
newcomer who would not make the cut on score, then assert the newcomer is invited, that they
occupy the *last* slot rather than displacing a higher-ranked worker, that the match carries
`invitationReason: 'exploration'`, and that with `EXPLORATION_SLOTS=0` they are not invited at
all. Add a metrics assertion that acceptance rate is reported separately for `ranked` and
`exploration` invitations — pooling them would be the silent failure.

A self-declared level must not clear a client's bar: assert that a worker who self-declares
level 5 against a gig requiring level 4 scores the same `levelFit` as a level-1 worker.

**End-to-end, locally.** Postgres on 5432; `cd server && npm run migrate && npm run seed &&
npx nodemon server.js`; `cd client && npm run dev`. Seeded logins are `<name>@isoko.demo` /
`password123` (`emmanuel` admin, `eric`/`aline` peer reviewers, `grace` client).

1. As `aline`, self-declare a bridal-tailoring specialisation → confirm she becomes rankable
   with a visibly small contribution labelled self-declared.
2. Photograph any document, submit it as a certificate → confirm the assigned reviewer is not
   Aline and not someone she has worked with, and that the assignment carries a seed.
3. Approve it as that reviewer → confirm provenance moves to `document_sighted` and her ranking
   on a matching gig rises.
4. `GET /api/gigs/:id/candidates` → confirm five components, that `componentVariance` reports a
   non-trivial `effectiveInfluence` for `credentials`, and that switching to `credential_first`
   re-ranks.
5. Post a gig with `requiredLevel: 4` and approve it → confirm an established worker takes the
   earned slots, that a brand-new worker is still invited in the reserved slot with
   `invitationReason: 'exploration'`, and that `GET /api/admin/metrics` shows a non-zero
   newcomer invitation share with the two invitation reasons reported separately.
6. Switch the interface to Kinyarwanda and re-read the candidate explanation — every new reason
   key must render translated. `node scripts/check-i18n-parity.mjs` gates this in CI.
7. Confirm a `plain`-arm client sees no tier labels anywhere.
