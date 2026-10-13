# Isoko Talents — closing the gaps: borrowed foundations, distinctive features, responsive UI

> Supersedes the SMS notification plan, which is built and committed
> (`714bac0`..`404ca70`, 11 Oct 2026). That plan's text is in git history.
>
> **Status:** Phases 0–8 and Round 2 items 10–11 are built and committed (14 Oct 2026). Still to build: 13 (safe visit), 14 (voice notes), 9 (USSD), 15 (worker voice), 12 (job cover). Walkthrough for a tester: `TESTING.md`, section 7.

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

### Phase 9 — USSD (stretch)
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
| 15 | **Worker voice**: admins post short polls on platform rules; only workers with a paid job vote; results are public | Platform cooperatives (Up&Go) | Fairwork's "fair representation" principle, measured on the scorecard |
| 9 | **USSD** (carried over): menus for basic phones | Ayambe, Text4Jobs Ghana | Includes entering the completion code |

Recommended order: 10 (cheap, strongest for the defence), 11, 13, 14, 9, 15, 12.

## Round 4 — signature features for the defence (in progress)

Built in this order, each committed with its tests:

1. ✓ **Worker Voice** (item 15; done 14 Oct: worker page `/voice`, admin under People & trust, results on `/fairwork`). Admins post a short poll on a platform rule; only workers with at
   least one paid job may vote, one vote each; counts are public on `/fairwork` while the poll is
   open; when it closes an admin must publish what was done about the result. Fairwork's
   "workers vote on platform rules" check counts polls decided this way.
2. ✓ **Job Cover** (item 12; done 14 Oct: offered at pay-in, card on the job, policy on the receipt, admin under Money › Job Cover). For on-site trades the client can add accident cover when funding
   escrow: 2% of the price (minimum 300 RWF), covering medical costs up to 300,000 RWF for the
   job's day. Simulated insurer; policy number on the receipt. The covered worker files a claim
   from the job card within 7 days; an admin approves or declines it with a reason.
3. ✓ **USSD** (Phase 9; done 14 Oct: `POST /api/ussd/gateway` for the gateway, `Basic phone` page for workers as a simulator). `POST /api/ussd` in Africa's Talking's format (sessionId, phoneNumber,
   text, replying `CON`/`END`). A worker's confirmed phone number is their login. Menus: open jobs
   in my trades, my active job (enter the completion code), earnings this month, language. An
   on-screen phone simulator (worker sidebar › Basic phone) lets the panel see it working.
   To dial it from a real handset: an Africa's Talking account and service code, the API on a
   public URL, its callback set to `/api/ussd/gateway?secret=…` with `USSD_WEBHOOK_SECRET`.

## Round 3 — the worker's side (research of 14 Oct 2026, done 14 Oct)

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
