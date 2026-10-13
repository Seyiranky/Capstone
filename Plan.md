# Isoko Talents — closing the gaps: borrowed foundations, distinctive features, responsive UI

> Supersedes the SMS notification plan, which is built and committed
> (`714bac0`..`404ca70`, 11 Oct 2026). That plan's text is in git history.
>
> **Status: in progress** (13 Oct 2026). Phases 0–2 are done; Phase 3 is next.

## Context

A survey of comparable platforms (13 Oct 2026) found eleven that overlap with Isoko:

| Platform | Where | What it does |
|---|---|---|
| Kazispace | Rwanda | Matches formal and informal workers with employers; mentions skill assessments |
| Kora (RDB job portal) | Rwanda | Government job matching |
| KigaliJob | Rwanda | Job board and training listings |
| Ayambe | Rwanda | Youth jobs by app and, reportedly, USSD |
| Lynk (acquired by Eden Life, 2022) | Kenya | Manually vetted artisans; profiles grow with completed jobs |
| Fundis | Kenya | Artisans issue quotes, invoices and receipts that support micro-credit |
| SA Youth / Harambee | South Africa | Matches youth to work near home; zero-rated data; WhatsApp and call-centre support |
| KayaHelp, Handymesh, CitiTasker | Nigeria | Verified artisans; payment held in escrow until the job is done |
| Diwala | Kenya, Uganda | Institution-issued verified credentials |
| Upwork, Fiverr | Global | Remote freelancing; escrow, milestones, proposals, disputes |
| TaskRabbit | Global | Pre-screened local taskers; job photos; on-site work |

Isoko already has things none of them combine: peer-verified skill tasks with appeals and
collusion detection, explainable ranking, a newcomer exploration slot, a revocable public
Skill Passport, a signed income statement, and pilot instrumentation.

What it lacks are the **foundations users expect from any of them**. Payment is requested only
after a job is marked complete, so nothing protects either side while the work happens.
Workers cannot name a price. There is no dispute route. Completed jobs leave no evidence on
the worker's profile. A rejected applicant learns nothing. Isoko is also the only platform in
the table with no answer for a phone without data.

Outcome wanted:
1. Every borrowed foundation is present, so an examiner can't name a basic feature that's missing.
2. Each one is implemented **in a way that feeds Isoko's verification and trust model**, so
   it isn't a copy. For example, a completed job becomes passport evidence, and disputes are
   judged by peers the collusion detector has screened.
3. Every screen works at 360px, 768px and 1280px.

## Positioning (for the defence)

> Kazispace and Kora match people to jobs; Lynk and KayaHelp vet artisans by hand and hold
> money in escrow. Isoko verifies skills that have no certificate in a way that resists
> gaming, explains every ranking, gives newcomers a fair chance — and turns every paid job
> into portable, verifiable evidence of competence and income.

| Gap in the market | Who leaves it open | How Isoko closes it |
|---|---|---|
| Informal skills have no proof | Diwala needs an institution; Lynk vets by hand | Peer-reviewed skill tasks, appeals, collusion screening (built) **+ job completions as evidence (Phase 4)** |
| Rankings are a black box | All of them | "Why this ranking" breakdown (built) |
| Newcomers never get a first job | Upwork, Fiverr | Exploration slot (built) **+ apprentice seats (Phase 7)** |
| Escrow disputes go to a distant support desk | Upwork, KayaHelp | **Peer mediators screened for collusion (Phase 3)** |
| Income can't be shown to a lender | Most (Fundis partly) | Signed income statement (built) **+ receipts per release (Phase 2)** |
| Race to the bottom on price | Upwork, Fiverr | **Fair-rate floor from completed local gigs (Phase 6)** |
| Basic phones are shut out | All except Ayambe | **USSD menu including entering the completion code (Phase 9)** |

## Phases

Phases 0–6 are the core. Phases 7–9 are stretch, ordered by how much they add to the
defence relative to effort. Each phase is committed on its own, with tests, and leaves
the app working on the simulated payment adapter and the `log` SMS driver.

### Phase 0 — Responsive and visual pass (done, 13 Oct 2026)

Audited every route as worker, client, admin and visitor at 375px and 1280px with Playwright.
Findings so far:

- Gig detail, "Your application": the progress dots don't line up with the status tag on
  desktop, and on phones the vertical steps are misaligned with dead space below. Replace
  them with a progress bar that's left-aligned and the same at every width.
- Gig detail, applicants table: the pinned action column covers worker names on phones and
  cuts off "Why this ranking" on desktop; "New — no reviews yet" wraps one word per line.
  Replace it with a responsive applicant list (one card per applicant, with match details
  that expand).
- Header: the unread badge overflows the right edge at 375px.
- Done as well: stat figures stay on one line and the third tile spans the row on phones;
  the admin category chart is horizontal; the wallet history is a two-line list on phones;
  the wallet how-to is a plain numbered list; each review shows one identity, not two;
  the dashboard charts sit side by side from tablet width; phone tables use tighter cells.
- Bug found on the way: the locale files used i18next's pre-v21 `_plural` suffix, which
  v26 ignores ("From 5 review"). Renamed to `_other`.
- Checked at 375px, 820px and 1280px with no element past the right edge.

### Phase 1 — Escrow with a completion code (done, 13 Oct 2026)
*Borrowed from:* Upwork escrow, KayaHelp/Handymesh held payments, Bolt/Glovo handover PINs.

- When the worker accepts, the client funds the agreed amount. Through the existing
  `paymentService.initiate` → callback path, the money becomes **held**.
- `Transaction` gains `escrowStatus: 'none' | 'held' | 'released' | 'refunded'`, plus
  `releasedAt` and `refundedAt`. The existing `initiated → confirmed | failed` table is
  unchanged. Escrow is a second state machine on confirmed rows, with its own exhaustive
  transition table.
- A 4-digit **completion code** is generated when the match is accepted and stored as a hash
  on `Match`. The client sees it in the app (and by SMS if they chose SMS). The worker enters
  it on site, which marks the match complete and releases escrow in one transaction.
- Lockout after 5 wrong attempts. The client can still release manually. **Auto-release
  72 hours** after the worker marks the job done, unless a dispute is open. Upwork does
  the same thing after 14 days; 72 hours suits small local jobs.
- Migration, model, service, controller, routes, client "Job in progress" card, tests
  covering the transitions, idempotent release, and lockout.
- As built: the code is stored as plain digits but excluded by `Match`'s default scope, so
  only the client's own match list returns it. Hashing it would stop the client seeing it
  again, and the 5-try lockout is what protects it. Only the client can complete a match
  directly now; the worker uses the code or "report done". Income statements, wallets and
  dashboards count a worker's money only once released. 14 new tests in `escrow.test.ts`.

### Phase 2 — Quotes and receipts (done, 13 Oct 2026)
*Borrowed from:* Upwork proposals, Thumbtack quotes, Fundis receipts.

- An application can carry a **quote** (amount and a short note). The default is the gig
  budget, so existing applications still work. Approving an application fixes the price
  that Phase 1 escrows.
- Each release issues a **receipt** with a number, both parties, the gig, and the amount,
  signed the same way as the income statement and checkable at a public URL with a QR code.
- The income statement lists receipt numbers, so a lender can check any line.
- As built: receipt numbers are random (`ISK-XXXX-XXXX`, Crockford base32, 40 bits), not
  signed, because the public page at `/r/<number>` reads Isoko's own record and that is the
  check. Payouts released before this existed were numbered by the migration. The receipt
  shows names and the job, never contact details. 8 new tests in `quotesAndReceipts.test.ts`.

### Phase 3 — Disputes settled by screened peers
*Borrowed from:* Upwork disputes; jury-style resolution.

- Either party can open a dispute while escrow is held, giving a reason and optional
  evidence. This freezes auto-release.
- **Three mediators** are drawn from high-trust users. Anyone who is linked to either party,
  or flagged by `collusionDetectionService`, is excluded, reusing the reviewer-assignment
  pool rules from skill tasks.
- Each mediator votes to release, refund, or split 50/50, and the majority applies. An admin
  can override, and every override is recorded. Mediators who side with the majority get a
  small trust adjustment, which is capped.
- If no majority forms within 5 days, an admin decides.

### Phase 4 — Completed jobs become evidence
*Borrowed from:* Lynk career profiles, TaskRabbit job photos.

- When entering the completion code, the worker can attach up to 3 photos, using the same
  upload path and `sha256` handling as skill-task evidence.
- The profile gets a **Work history** strip of completed jobs, each with photos and the
  client's rating.
- The Skill Passport shows **"N paid jobs completed in this skill"** next to the peer
  verification. Isoko stays the source of truth, and the passport remains revocable.

### Phase 5 — Rejection reasons and next steps
*Borrowed from:* SA Youth employer feedback.

- Rejecting an application requires a reason: *skill level*, *distance*, *timing*,
  *chose another applicant*, or *other*.
- The worker sees the reason. For *skill level*, they also get a link to that skill's
  verification task, which turns a rejection into a next step.
- Admins see counts of reasons by skill, a signal of where training is needed.

### Phase 6 — Fair-rate guidance
*Borrowed from:* Upwork and Malt rate insights.

- For each skill, compute the median and 25th percentile of released escrow amounts. Below
  a minimum number of jobs, fall back to a seeded reference rate.
- When a client posts a gig below the 25th percentile, they see a soft warning. Workers
  writing a quote see the typical range.

### Phase 7 — Apprentice seats (stretch)
*Not offered by any platform surveyed.*

- A verified worker can add one apprentice to a gig they've accepted.
- When the job is released, the senior worker's endorsement counts as **one** peer review
  toward the apprentice's skill task. It's capped at one per skill, and the senior must have
  passed that skill.

### Phase 8 — Crew gigs (stretch)
*Borrowed from:* Upwork agencies.

- Workers apply as a crew, with each member's share agreed up front. Escrow releases in parts.

### Phase 9 — USSD (stretch)
*Borrowed from:* Ayambe, M-Pesa menus, SA Youth zero-rating.

- A USSD session endpoint in the shape of the Africa's Talking USSD API. Its `log` driver
  works with no account, mirroring the SMS driver.
- Menu: open gigs near me, my applications, wallet balance, **enter completion code**.
- An in-app USSD simulator page for the demo.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Escrow model | A separate escrow state on confirmed transactions | Keeps the provider-callback state machine untouched; a real MoMo collection still settles the same way |
| Release trigger | Completion code, then manual release, then 72-hour auto-release | Works offline on site; the client can't hold money hostage forever |
| Dispute judges | Screened peers, admins as fallback | Reuses the collusion and assignment work; doesn't depend on a support desk |
| Stretch scope | Phases 7–9 only after 0–6 are green | Depth on the core beats breadth for the defence |

## Verification

- Server: `npm run lint && npm run typecheck && npm test && npm run build` after each phase.
- Client: `npx eslint src && npx tsc --noEmit -p tsconfig.app.json && npm test && npm run build`.
- Playwright screenshots at 375px and 1280px for each changed screen.
- `TESTING.md` gains a walkthrough for each phase, from a demo account.
