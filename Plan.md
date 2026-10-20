# Isoko Talents — closing the gaps: borrowed foundations, distinctive features, responsive UI

> Supersedes the SMS notification plan, which is built and committed
> (`714bac0`..`404ca70`, 11 Oct 2026). That plan's text is in git history.
>
> **Status:** Phases 0–8, Rounds 2–4 and the security review are built and committed (14 Oct 2026). USSD (Phase 9) and Worker Voice (item 15) were built and then dropped. Walkthrough for a tester: `TESTING.md`, section 7.

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
| Basic phones are shut out | All except Ayambe | Not addressed: USSD was built and then dropped (Phase 9) |

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

### Phase 3 — Disputes settled by screened peers (done, 13 Oct 2026)
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
- As built, with two deviations. (1) No trust-score adjustment for mediators: each vote
  records `withMajority` instead, so the trust score keeps meaning reviews, completion and
  verified skills only. (2) Evidence is written statements from both sides; photos come with
  Phase 4's completion evidence. The other party can respond once, and votes stay hidden
  (mediators anonymous to the parties) until the dispute closes. The client paying out, or
  the job being called off, settles a live dispute. 15 new tests in `disputes.test.ts`.
- Finding: in the 15-account demo data only one member (Claudine) is eligible to mediate a
  Robert/Jean Bosco dispute; everyone else well rated has worked with one of them. So demo
  disputes go straight to an admin, as designed. Showing a full panel in the demo needs seed
  users with good records and no ties to the demo clients.

### Phase 4 — Completed jobs become evidence (done, 13 Oct 2026)
*Borrowed from:* Lynk career profiles, TaskRabbit job photos.

- When entering the completion code, the worker can attach up to 3 photos, using the same
  upload path and `sha256` handling as skill-task evidence.
- The profile gets a **Work history** strip of completed jobs, each with photos and the
  client's rating.
- The Skill Passport shows **"N paid jobs completed in this skill"** next to the peer
  verification. Isoko stays the source of truth, and the passport remains revocable.
- As built: photos can be added while the job is in progress or after it (so mediators can
  see them in a dispute), from the match card. Only jobs paid out through escrow appear in
  the work history, each with its rating and receipt link. The per-skill paid-job count is
  not part of the passport's signed summary, so passports issued earlier still verify.
  6 new tests in `workHistory.test.ts`.

### Phase 5 — Rejection reasons and next steps (done, 13 Oct 2026)
*Borrowed from:* SA Youth employer feedback.

- Rejecting an application requires a reason: *skill level*, *distance*, *timing*,
  *chose another applicant*, or *other*.
- The worker sees the reason. For *skill level*, they also get a link to that skill's
  verification task, which turns a rejection into a next step.
- Admins see counts of reasons by skill, a signal of where training is needed.
- As built: the "verify this skill" link opens the Dashboard's add-skill form directly.
  Applications closed because the gig was filled get `choseAnother` automatically. An
  optional note (280 characters) goes to the worker with the reason. My applications is a
  list on phones. 4 new tests in `rejectionReasons.test.ts`.

### Phase 6 — Fair-rate guidance (done, 13 Oct 2026)
*Borrowed from:* Upwork and Malt rate insights.

- For each skill, compute the median and 25th percentile of released escrow amounts. Below
  a minimum number of jobs, fall back to a seeded reference rate.
- When a client posts a gig below the 25th percentile, they see a soft warning. Workers
  writing a quote see the typical range.
- As built: pooled by skill category (specialisations share their parent's). Paid amounts
  need at least 3 jobs; split-dispute payouts are left out. Below that the guidance uses
  posted budgets and says so; below 3 of those it shows nothing. No invented reference rates.
  4 new tests (`rateService.test.ts`, `rates.test.ts`).
- Found on the way: the dev database has every skill category twice (the categories seeder
  ran again on 2 Oct and inserted copies). The seeder now inserts only missing categories.
  The four unused 2 Oct copies are still in the dev database, awaiting a decision to delete.

### Phase 7 — Apprentice seats (done, 14 Oct 2026)
*Not offered by any platform surveyed.*

**Changed from the first draft.** The draft counted a senior's endorsement as one peer
review. But a senior who has worked a job with the apprentice is exactly the tie that
disqualifies reviewers, and the collusion audit flags it. Counting it would weaken the
verification the defence rests on. Instead:

- A worker who is verified in the gig's skill category can add one apprentice to a job they
  have accepted, and may give them a share of the pay, up to 30%. The apprentice accepts or
  declines.
- When the job is paid, the senior can endorse the apprentice. An endorsement is its own
  evidence tier, **supervised**, between self-declared and certificate-sighted: real (a paid
  job, alongside a verified worker) but not independent. It never counts as a peer review.
- Apprentices get their own payout, receipt and work-history entry.

### Phase 8 — Crew gigs (done, 14 Oct 2026)
*Borrowed from:* Upwork agencies.

- A worker applies with named crew members and agreed shares (the lead keeps at least 10%).
  The client sees the team before approving. On acceptance each member is invited and joins
  or declines; a decliner's share stays with the lead.
- **Payouts.** Release now creates one payout per person (lead, crew, apprentice), each with
  its own receipt. Income statements, wallets, work history and paid-job counts read payouts,
  so each person sees only their share. Existing payouts are backfilled one-per-job.
- As built: crew and apprentices see the job on their match list, with a "you are on this
  job as …" line; payment, the code and disputes stay with the lead. A worker who was
  *invited* by the ranking (rather than applying) cannot name a crew, since crew is declared
  on the application; they can still take an apprentice. 13 new tests in `teams.test.ts`.

### Phase 9 — USSD (dropped)
*Borrowed from:* Ayambe, M-Pesa menus, SA Youth zero-rating.

- A USSD session endpoint in the shape of the Africa's Talking USSD API. Its `log` driver
  works with no account, mirroring the SMS driver.
- Menu: open gigs near me, my applications, wallet balance, **enter completion code**.
- An in-app USSD simulator page for the demo.

### Added on request — photos in messages, and making sure they arrive (done, 13 Oct 2026)

- A message can carry one photo (images only, 10 MB), with or without text; it is hashed
  like other evidence. Text messages still go as JSON, so nothing else changed.
- The recipient is told wherever they are in the app: a notice opens the conversation.
  The inbox shows unread counts and a last-message preview; opening a thread marks it read
  and the sender sees "Seen" under their last message, live over the existing socket.
- 6 new tests in `messagePhotos.test.ts`; checked with two browsers at once.

### Added on request — an admin console in the sidebar (done, 14 Oct 2026)

- The admin tab bar is gone. Every admin page is a sidebar entry, grouped: **Operations**
  (gig approvals, skill reviews, jobs, disputes, marketplace), **Money** (payments & escrow),
  **People & trust** (users, reviewers, integrity audit), **Insights** (analytics, research
  metrics, market & pricing), **System** (delivery health).
- New pages, all on live data: *Payments & escrow* (awaiting, held, paid out, refunded, with
  every transaction and receipt); *Research metrics* (RQ2 acceptance by arm, newcomer access,
  time to first match, review turnaround, RQ3 allocation, from `/api/admin/metrics`, which
  had no screen before); *Reviewers* (enrol peers; the server still enforces eligibility);
  *Market & pricing* (usual pay per trade, rejection reasons by skill); *Jobs*; *Skill
  reviews*. Gig approvals and skill reviews are laid open; nothing sits behind a pop-up.

### Added on request — trade photos for gigs (done 14 Oct 2026)

Gigs without a client photo once used a single stock photo per trade, so every tailoring
card looked the same. A short-lived drawn-cover version was rejected as not looking like a
marketplace. Each trade now has a pool of six to ten real photos of African workers doing
that trade (Pexels, credited in `client/src/assets/gigs/CREDITS.md`); the gig's id picks
one, so a gig keeps its photo and neighbouring cards rarely repeat. A photo the client
uploads still comes first.

## Round 5 — Mobile Money instead of escrow (decided 14 Oct 2026)

The owner decided to drop escrow: Isoko does not hold money. The flow returns to the one before
Phase 1, with the real MTN MoMo API behind the existing payment adapter.

1. **Job flow.** A worker accepts; nothing is collected. The client marks the job done, then pays
   with MTN Mobile Money from the job card: a payment request goes to the client's MoMo number,
   they approve it on their phone, and the payment is confirmed (by polling the provider, or by
   its callback). Payouts and receipts are created on confirmation, as before.
2. **Removed:** collection at acceptance, the 4-digit completion code, "report the job done" and
   the 72-hour automatic release, every "held in escrow" screen.
3. **Disputes stay, as mediation.** Either side can still open one while the job is in progress;
   the panel decides: release (the job is done and the full price is due), refund (the job is
   called off, nothing is due) or split (the job is done and the share decided is due).
4. **Add-ons in the same MoMo payment.** The safety-net share is chosen when paying. Job Cover is
   added by the client while the job is in progress (cover starts then); its premium is billed in
   the final payment. Cover data moves from the transaction to the match.
5. **MTN MoMo API.** A `mtn-momo` adapter for the Collections API: token, `requesttopay`, status
   check; sandbox first (`MOMO_TARGET_ENV=sandbox`, currency EUR in the sandbox), production by
   environment variables. Callbacks are verified by re-reading the status from MTN, never trusted
   as sent. Payouts to workers go out through the Disbursements API when it is configured; the
   payout records whether the transfer was sent. A script creates the sandbox API user and key
   from the subscription key. `PAYMENT_PROVIDER=simulated-momo` keeps working for tests and demos.
6. **Payments made under escrow.** Money already held when the switch was made shows as "Paid in
   advance": it goes to the worker, with a receipt, when the client marks the job done, and back
   to the client if the job is called off or a dispute ends in a refund.

**Status: done.** Server and client switched; admin Payments and Disputes pages redesigned for the
new flow; 468 server tests pass, including `momoPayments.test.ts` against a mocked MTN API.

## Round 6 — Help & support (done 14 Oct 2026)

One front door for "something is wrong", answered by the admins. A **support ticket** is a
conversation between one person and the Isoko team, with a status; Reports and Disputes stay
as they are and a ticket can be turned into either.

1. **Ticket model.** Reference number (SUP-XXXX-XXXX), category (payment, account, skills, job,
   safety, bug, other), subject, status (open → waiting on you → resolved → closed), priority
   (safety starts urgent, payment high), an optional link to the job, payment or skill
   submission it is about, the page it was opened from, an assignee, first-reply, resolved and
   closed times, and the person's rating ("Did this solve it?").
2. **Thread.** Replies both ways with one optional photo or PDF each (private, signed links like
   chat media). Admins can also write internal notes the person never sees. System events
   (received, reopened, resolved, escalated) appear in the thread in the reader's language.
3. **People.** A Help & support page: search and quick answers by category first, then a contact
   form that can attach the job or payment in question; "My requests" with unread marks; a
   thread view to reply, close, or rate. "Need help?" links on the payment panel and the wallet
   open the form already filled in. Replies arrive through the bell, email or SMS.
4. **Signed out.** "Can't sign in?" on the login page opens a short form (name, email, message).
   The person gets a private link by email to follow and answer the ticket without an account.
5. **Admins.** A Support inbox under Operations: counts (open, unassigned, waiting, median first
   reply, satisfaction), filters, oldest-waiting first; a ticket view with the person's trust,
   jobs, payments and earlier tickets beside the thread; reply or internal note; saved replies in
   English and Kinyarwanda with the person's name filled in; status, priority and assignee;
   escalation into a dispute on the linked job or a report about the other person.
6. **Limits.** At most 5 open tickets and 10 new a day per person; signed-out forms rate-limited
   by address; attachments checked by content, not name; people only ever see their own tickets.

**Status: done.** Server (`supportService`, `/api/support`, migration `20261015100000`, 21 tests in
`support.test.ts`) and client (Help & support page, request thread, contact form, "Can't sign in?"
page and private link, admin Support inbox with saved replies and escalation, "Need help?" links on
the payment panel and wallet, unread counts in the sidebar, support notices in the bell). 502 server
tests pass.

**Help centre redesign (14 Oct 2026).** At the owner's request the page follows a help-centre layout:
"Hi, how can we help?" with a search whose results open in a panel over the page, and a 3×3 grid of
cards (seven topics, Your requests, Contact the team). Each topic has its own page of articles and
each article its own page with "Did this answer your question?"; a round chat button opens the
contact form anywhere in the help centre. Routes: /support, /support/topics/:category,
/support/topics/:category/:n, /support/requests, /support/:id.

## Round 7 — Disputes after the job is done (done 16 Oct 2026)

**Found.** Opening a dispute was allowed only while a job was in progress: a rule from escrow,
when the money sat with Isoko during the job. With Mobile Money the client pays after marking the
job done, so the arguments that matter come later and could not be raised: a worker whose client
marked the job done and has not paid; a client who paid and then found the work faulty. The only
way in was a link on an in-progress job card; the Disputes page had no "Open a dispute".

**Change.** The server decides, per job and per person, whether a dispute can be opened, at which
stage, and for which reasons; the screens only show what it allows.

| Stage | When | Reasons | Outcome |
|---|---|---|---|
| In progress | accepted | as before | as before |
| Awaiting payment | done, not paid | worker: not paid; client: not done, poor quality, other | release: full price due · split: half due · refund: called off, nothing due. Payment waits while it is open |
| Paid | paid, within 14 days of done | not done, poor quality, other | release: nothing changes · split/refund: the worker owes that amount back; Isoko cannot reverse MoMo, so a support request is opened for an admin to arrange it |

One dispute per job. "Open a dispute" on every eligible job card and on the Disputes page, with the
stage explained in the form. Tests cover each stage, the payment pause, the window and the
refund-owed request.

**Status: done.** `disputeService.eligibility` / `GET /api/disputes/eligible` decide; migration
`20261016090000` adds the stage, refund owed and support request; `disputeStages.test.ts` (6 tests)
plus updated `disputes.test.ts`. Checked in the browser with a throwaway job: the worker disputed a
job done but unpaid, the client's payment waited, an admin decided split, and the client was asked
for half. 511 server tests pass.

## Round 8 — SOS and safe visits, end to end (done 16 Oct 2026)

**Defects found**

Worker side:
1. The SOS button sat inside the job's "More" drawer: two taps away in an emergency.
2. If the visit status failed to load (patchy data), the whole bar, SOS included, was not shown.
3. An SOS texted the trusted contact first and waited for the SMS gateway (up to 10 s) before
   saving the alert or telling the admins.
4. Once the client marked the job done, check-out and SOS were refused: the worker stayed
   "checked in" and admins got a false "not checked out" alert 12 hours later.
5. Crew members on site could not check in or raise an SOS, and visit status was per job, not
   per person, so two people on one job overwrote each other.
6. After an SOS the worker saw a toast and nothing more: no sign it was seen, no 112 prompt; a
   failed SOS said only "Something went wrong".
7. Every tap made a new alert, burying the real one.

Admin side:
8. An alert showed a name and a job title: no worker phone, trusted contact phone, client, or
   job location to act on.
9. "Mark handled" kept no note and the list did not show who handled it.
10. The page did not refresh and the sidebar showed no count of open alerts.
11. The overdue notice named neither the worker nor the job.

**Fixes.** Save and alert first, text in parallel; SOS on the job card, always shown, with a
112 call button and a live state ("sent · seen by Isoko · handled"); check-out and SOS work
after the job is closed while someone is checked in; crew members included, status per person;
repeat SOS within 2 minutes joins the open one; admins see everyone's numbers and the job's
place, acknowledge ("I'm on it", which tells the worker) and close with a note, with who and when
shown; the page refreshes itself and the sidebar counts open alerts.

**Status: done.** Migration `20261016120000` (acknowledged by/at, closing note); `safeVisit.test.ts`
now 13 tests. Checked in the browser with a throwaway worker and client (SMS driver: log): bar on
the card, check in, SOS with 112, admin sees all three numbers and the phone's location, "I'm on
it" reaches the worker's card, close with a note, and check-out after the client marked the job
done. 521 server tests pass.

## Round 9 — Who decides an application (done 19 Oct 2026)

**Found.** Applications are decided by admins: `PUT /gig-applications/:id/review` is admin-only,
every admin is notified of every application, and the gig page gives Approve/Reject only to
admins. The client sees applicants but cannot choose. (An earlier answer in this session said
the client decides; that was wrong.)

**Decision.** Rules first, the client decides, admins act by exception — the model used by
Upwork, TaskRabbit and Lynk. Built and verified one step at a time:

1. **Client decides; eligibility rules.** The gig's owner approves or rejects its applicants;
   admins can still step in. The client, not every admin, is told of each application. Applying
   needs an active account, a confirmed contact and no open report against the worker. A gig can
   be marked **sensitive** (children, working inside a home), by the client when posting, by
   keywords Isoko recognises, or by the admin at gig approval; applying to one also needs a
   reviewed skill in the trade, a confirmed phone, and a record (a paid job or a trust score of
   4.0+). A worker who does not qualify is told why and what to do; the server enforces it.
2. **Reminders and expiry.** An application unanswered for 48 hours reminds the client once; at
   7 days it expires and the worker is told, so nobody waits for ever.
3. **Admin Applications overview.** Only what needs a look: overdue, on sensitive gigs, and red
   flags (an open report on either side, a burst of applications, a quote far below the trade's
   usual rate). An admin can decide on the client's behalf, withdraw an application with a
   reason, or message either person.

**Status: done (17–19 Oct 2026), each step built, tested and checked in the browser before the next.**
1. Commit `2bba17e`: client decides; eligibility rules (`applicationEligibility.ts`), sensitive gigs
   (migration `20261016150000`, keyword check in English and Kinyarwanda, `npm run
   backfill:sensitive`); invitations and accepting follow the same rules. `applicationRules.test.ts`.
2. Commit after `2bba17e`: reminders at 48 h, expiry at 7 days (`applicationFollowUp.ts`, migration
   `20261016170000`, server sweep); waiting time shown to the client. `applicationFollowUp.test.ts`.
3. Admin Applications overview (`applicationOversight.ts`, `/admin/applications`), flags, withdraw
   with a reason, message either person, sidebar count. `applicationOversight.test.ts`.
543 server tests pass.

## Round 10 — Submission readiness: gaps against the proposal and the rubric (found 19 Oct 2026)

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

### Plan to close the gaps (agreed 20 Oct 2026)

Owner decisions: mentor-worker messaging and Airtel Money are justified in the report rather than
built (focus on MTN MoMo); evidence is gathered and the report and video script drafted for the
owner to edit, own and record; hosting is Render + Supabase (free); the MTN sandbox key is
obtained by the owner. Throughout: SMS stays on the `log` driver, secrets are never printed or
committed, and each phase is committed on its own and marked done here.

### Round 10, phase 1 — Core defects (Tue)

#### 1.1 Peer reviewers get a review screen, and can recuse (FR-5, FR-6, RQ1)

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

#### 1.2 An admin can message a client

- In `server/src/controllers/messageController.ts:13`, add `['client', 'admin']` to `ALLOWED_PAIRS`.
- Check the client inbox opens the thread from AdminApplications and from AdminSupport's person drawer.
- Test: admin↔client both ways; client↔client is still refused.

#### 1.3 Small fixes

- `client/Dockerfile` moves to `node:24-alpine`, matching the server Dockerfile and CI.
- Clear the 52 server and 5 client lint warnings, for example the `useEffect` dependencies in `DisputesPage.tsx:46`.
- **Duplicated `sensitiveGig.ts`:** keep the two copies (server and client), but add `scripts/check-shared-copies.mjs`. It fails if they differ, mirroring `check-i18n-parity.mjs`, and runs in the CI i18n job. That's cheaper and safer than a shared package across two build systems.

---

### Round 10, phase 2 — MTN MoMo sandbox, live (Tue, needs the owner for 10 minutes)

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

### Round 10, phase 3 — Privacy and account deletion (Wed morning; NFR-7)

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

### Round 10, phase 4 — Free deployment (Wed)

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

### Round 10, phase 5 — Performance (Wed afternoon)

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

### Round 10, phase 6 — Testing evidence (Thu)

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

### Round 10, phase 7 — Code quality (Thu)

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

### Round 10, phase 8 — Bilingual notices (Thu, as time allows; NFR-1)

- Add a migration giving `Notifications` a `key` (string) and `params` (JSONB).
- Add `server/src/lib/notices.ts`, a catalogue `{ key: { en: {title, body}, rw: {title, body} } }` with interpolation.
- `notify()` in `lib/notify.ts` accepts `{ key, params }` and renders in the recipient's `preferredLanguage` for in-app, SMS (`smsText`) and email (`email.render`). The old `{title, body}` callers keep working.
- In the client, `kindOf` (`lib/notificationKind.tsx`) prefers `n.key` and falls back to the title regex. Otherwise translated titles would break the classification.
- Convert the call sites that go by SMS and email first: the `outcome` and `critical` categories (payments, approvals, SOS, disputes, support replies). Convert the rest of the ~50 as time allows.
- The owner proofreads the Kinyarwanda.
- Tests: an RW user gets an RW in-app notice and an RW SMS body; an EN user is unchanged.
- **If Thursday runs out,** the unconverted call sites are listed as a limitation in the report.

---

### Round 10, phase 9 — README, report draft, video script, ZIP (Thu evening to Fri)

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

### Round 10 schedule

| Day | Work |
|---|---|
| Tue 20 | Phase 1; Phase 2 once the owner has the MTN key |
| Wed 21 | Phase 3; Phase 4 (owner creates Render, Supabase and cron-job.org accounts); Phase 5 |
| Thu 22 | Phase 6; Phase 7; Phase 8 as time allows; README |
| Fri 23 | Report draft by midday; owner edits and records the video; ZIP; submit by evening, not at 23:59 |

Each phase:
- is committed on its own;
- updates `Plan.md` Round 10 when it is done;
- is checked in the browser with throwaway accounts, deleted afterwards.

### Round 10 verification

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

## Security review

A review of authentication, access control, personal data and uploads before the defence.
Each fix is covered by `server/tests/integration/security.test.ts`.

| Found | Risk | Fix |
|---|---|---|
| `forgot-password` returned the reset token in its response | Anyone knowing an email could take over the account, admins included | The link is emailed (printed to the server log with `EMAIL_DRIVER=log`); tokens are stored hashed; same answer for known and unknown addresses |
| Users nested in other records (a gig's client, an applicant) carried email, phone, trusted contact, savings, research arm | Contact details of every client exposed, even to visitors who were not signed in | Users serialize to a public field set by default; only the owner (`/me`, data export) and admins get the private view |
| Uploaded files kept the uploader's file extension | A file named `.html` but declared as an image was served as a web page (stored XSS) | Extension comes from the checked type only |
| Chat photos, voice notes and skill evidence were public to anyone with the link | Private conversations and documents readable without a login | Signed links that expire in 24–48h, issued only in responses the viewer may see |
| No rate limits | Password guessing; SMS-code requests cost money | Failed logins 10 per 15 min per account; sign-ups, reset emails and SMS codes limited |
| No security headers; CORS and sockets open to any site | Clickjacking, MIME sniffing, other sites calling the API from a user's browser | helmet headers, `x-powered-by` off, CORS and sockets limited to `APP_URL` (+ `CORS_ORIGINS`) |
| 500 errors returned internal messages | SQL and internals leaked to callers | Logged on the server; the caller gets a plain message |
| Gigs awaiting approval visible to anyone | Unmoderated content public before review | Only the posting client and admins see pending or rejected gigs |
| Sign-up accepted any email or password; emails case-sensitive | Junk accounts; `Grace@` and `grace@` as two accounts | Email format, 8-character passwords, lower-cased emails |
| Payment webhook accepted unsigned callbacks when no secret was set | In production, anyone could mark a payment paid | Refused in production without `PAYMENT_WEBHOOK_SECRET` |
| JWT algorithm not pinned | Defence in depth | Signed and verified as HS256 only |
| A client could edit a gig after a worker accepted it, including its budget | Terms changed under an agreed job and its escrow | Edits allowed only before a match; values validated; rewording an approved gig sends it back to review |
| Dependencies with published advisories (axios, multer, proxy-addr, qs, morgan, moment) | Known vulnerabilities shipped with the app | Updated with `npm audit fix`; the client's production dependencies report none. One remains on the server: `uuid` inside Sequelize 6, which only affects calls passing a buffer argument; the app never makes them, and npm's suggested "fix" is a downgrade to Sequelize 3 |
| Final sweep for common web vulnerabilities | SQL injection, XSS, open redirects | No raw SQL with interpolated values, no `dangerouslySetInnerHTML`/`eval`, no redirects built from user input |


Already sound and kept: bcrypt password hashes; role and suspension re-read from the database
on every request; per-record ownership checks in every controller; allowlisted profile updates;
timing-safe webhook secrets; parameterised queries throughout (Sequelize).

### Accounts

- **Change password** in Settings › Security needs the current password. Changing or resetting a password signs out every other device: sessions issued before `Users.passwordChangedAt` are refused by the API and the socket.

### Product review (defence readiness)

- Removed: the survey API (no screen, no data, no tests used it); the old `/verification`, `/mentorship` and `/admin/gigs/completed` redirects.
- Copy: no em dashes or emoji in user-facing text; status labels, chat defaults, gig toasts and the sign-in panel are translated. The sign-in panel now states what Isoko does (escrow, peer-checked skills, Kinyarwanda) instead of "simulated payments".
- Theme switch uses a sun/moon icon instead of a light bulb; the Google button is shown in English when the app is in Kinyarwanda (Google has no Kinyarwanda and fell back to French).
- Gig "Edit" is hidden once a worker is matched, matching the server rule.
- Decision: the admin console stays English-only. It is a staff tool; workers and clients see every screen in both languages.
- Before the defence: re-seed the demo database. Test runs left a 2,000,000 RWF job in the dev data that dominates the dashboards' charts.

### Trust between clients and workers

- **Confirmed contact before business**: posting a gig or applying needs a confirmed email or phone, so a throwaway account cannot transact.
- **Verification shown, details hidden**: applicant rows and profiles show "Phone confirmed" and "Email confirmed"; the number and address are never shown.
- **Off-platform warning**: a message that shares contact details or mentions paying outside Isoko (MoMo, `*182*`, "pay me directly", Kinyarwanda phrases) is delivered as written but carries a note that only money in escrow is protected. Warned, not blocked: sharing a number for directions is normal.
- **Reports**: anyone can report a user from chat or a profile (asked to pay outside, fake profile, no-show, harassment, other). Admins see them under People & trust › Reports with how often the person has been reported, close each as handled or dismissed (the reporter is told), and can suspend from the same menu. The reported user never learns who reported them.


## Round 2 — proposed (research of 14 Oct 2026)

A second survey looked past job marketplaces at what protects informal workers elsewhere.
Each idea below is in no platform from the first survey, and each builds on something Isoko
already has (escrow, payouts, receipts, trust, notifications).

| # | Feature | Borrowed from | What makes it Isoko's |
|---|---|---|---|
| 10 ✓ | **Fairwork scorecard** (done 14 Oct; public at `/fairwork`, admin under Insights): a public page scoring Isoko against the five Fairwork principles, computed from live data | Fairwork (Oxford Internet Institute), which rates platforms in 38 countries | Self-audited, live and checkable rather than a yearly external report |
| 11 ✓ | **Safety net** (done 14 Oct; pay-in step and Wallet): clients add a small contribution per job (suggested 3%) to the worker's benefits pot, for sick days or emergencies; workers can also auto-save a share of every payout toward Ejo Heza | Alia portable benefits; Rwanda's Ejo Heza savings scheme | Rides on escrow and payouts, so it happens on every paid job with no extra step |
| 12 | **Job cover**: optional accident cover per on-site job, paid as a small add-on when the client funds escrow (simulated insurer) | Turaco embedded micro-insurance | Priced per job and shown on the receipt |
| 13 ✓ | **Safe visit** (done 14 Oct; Settings → Safety, the job card, admin Safety alerts): for on-site jobs, the worker checks in and out, a trusted contact is told by SMS, and an SOS button alerts them and an admin | Ride-hailing safety features | Built for domestic and home-repair work, where most workers are women |
| 14 ✓ | **Voice notes** (done 14 Oct): record a voice note in chat and on a gig post, for people who find typing hard; up to 2 minutes and 3MB, listened back before sending; cards show which gigs have one | WhatsApp voice-note organising; Lesedi | Uses the existing upload path; the length is measured while recording, because browser WebM files carry none |
| 15 | **Worker voice** (dropped): admins post short polls on platform rules; only workers with a paid job vote; results are public | Platform cooperatives (Up&Go) | Fairwork's "fair representation" principle, measured on the scorecard |
| 9 | **USSD** (dropped): menus for basic phones | Ayambe, Text4Jobs Ghana | Includes entering the completion code |

Recommended order: 10 (cheap, strongest for the defence), 11, 13, 14, 9, 15, 12.

## Round 4 — signature features for the defence (in progress)

Built in this order, each committed with its tests:

1. **Worker Voice** (item 15): built on 14 Oct, then removed at the owner's request the same day; its tables are dropped (`20261014200000-drop-worker-voice`). Fairwork's "workers vote on platform rules" check is reported as not met again.
2. ✓ **Job Cover** (item 12; done 14 Oct: offered at pay-in, card on the job, policy on the receipt, admin under Money › Job Cover). For on-site trades the client can add accident cover when funding
   escrow: 2% of the price (minimum 300 RWF), covering medical costs up to 300,000 RWF for the
   job's day. Simulated insurer; policy number on the receipt. The covered worker files a claim
   from the job card within 7 days; an admin approves or declines it with a reason.
3. **USSD** (Phase 9): built on 14 Oct, then removed at the owner's request the same day. Not part of the product.

## Find workers (done 14 Oct 2026)

Clients can choose instead of only waiting for applications. `Find workers` (client sidebar)
lists active workers with level, trust score, paid jobs, availability, area, which contact
details are confirmed, and each skill with how it was proven (withheld for the research control
arm, as on ranked lists). Filters: name or skill, trade, area, proven skills only, available now;
sorted by trust, paid jobs or newest. From a card the client can message the worker or offer one
of their open gigs: a `direct` invitation the worker confirms, after which the client pays into
escrow as for any match. At most 5 direct invitations wait on a gig at once; posting and offering
need a confirmed contact.

## Round 3 — the worker's side

> The Growth page (monthly goal, evidence ladder, local demand, RPL pack) was removed at the owner's request on 14 Oct. Levels remain on profiles and in the directory; availability moved to Settings › Profile. (research of 14 Oct 2026, done 14 Oct)

What worker-facing platforms give their workers, and how Isoko does it differently.

| # | Feature | Borrowed from | What makes it Isoko's |
|---|---|---|---|
| 16 | **Availability**: available, busy, or away until a date | Upwork availability badge, Fiverr out-of-office | Away workers are skipped by the ranked shortlist, not just labelled |
| 17 | **Levels**: New, Rising, Trusted, Master | Fiverr seller levels, Upwork Top Rated, TaskRabbit Elite | Every criterion and the worker's progress are shown; JSS and Fiverr levels are opaque |
| 18 | **Skill ladder and RPL pack**: the evidence ladder per trade, and a printable summary for a Rwanda TVET Board Recognition of Prior Learning assessment | Rwanda's RPL programme (Swisscontact mechanics, REWU miners) | Platform evidence becomes a route to a national qualification |
| 19 | **Earnings goal** with progress | Uber driver Earnings Hub | Counts released money only |
| 20 | **Where the work is**: open gigs and typical pay by area, for the worker's trades | Uber demand heatmap | From real gigs and payouts, not estimates |

All on a new **Growth** page for workers; availability also on the Dashboard and profile.

As built: levels are computed in `levelService` and shown on the public profile with
availability; the RPL pack is a printable page at `/growth/rpl` listing skills with their
evidence tier and every paid job with its checkable receipt number. 6 new tests in
`growth.test.ts`.

**Known issue:** in 2 of 7 full server test runs on 14 Oct, one test failed (a different one
each time: a dispute split, an escrow code check). Neither fails when its file runs alone
(six repeats), and no other process touches the test database. Root cause not yet found.

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
