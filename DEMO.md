# Walkthrough video script

A recording plan for the Final Version of the Product video, about **15 minutes**. It follows the
brief's Section 2:

| Brief section | What it asks | Where it is covered |
|---|---|---|
| A. Core functionalities | Each major feature: what it does, how it works, the logic behind it | Parts 2–5 |
| B. Technical requirements | Front end and back end working together, data handling, logic | Parts 2–5 (code and Network tab), Part 6 |
| C. Testing with different inputs | Expected behaviour, error handling, system responses | Marked **[C]** throughout, summed up in Part 7 |
| D. Testing strategies | At least two approaches: why chosen, how done, results, what changed | Part 8 |
| E. Performance and compatibility | Browsers, operating systems, low-end and high-end devices, metrics | Part 9 |

Section 3 (code quality, OOP, algorithms) is assessed from the repository, but showing it briefly
(Part 10) helps the assessor find it.

Lines in *italics* are what to say. Change the wording to your own; keep the points.

---

## 0. Before you record (about 20 minutes)

**Wake the live site.** The free host sleeps when idle. Open
https://isoko-api.onrender.com/health until it shows `{"status":"ok"}`, then load
https://isoko-web.onrender.com once.

**Push first** (`git push`), so the GitHub pages you show match the code.

**Sign-ins.** The client and the worker are two different people, so use separate browser sessions:

| Window | Browser | Sign in as | Role |
|---|---|---|---|
| 1 | Chrome, normal window | `grace@isoko.demo` | Client |
| 2 | Chrome, incognito window | `eric@isoko.demo` | Worker (also a peer reviewer) |
| 3 | Safari (shows a second browser engine too) | `admin@isoko.demo` | Admin |

The password is `password123` for every account. Put windows 1 and 2 side by side for the job flow.

**VS Code**, with these files open in tabs, in this order:

| File | Show |
|---|---|
| `server/src/services/rankedInvitationService.ts` | `buildShortlist` (line 38) |
| `server/src/services/matchScoringService.ts` | `haversineKm` (line 102), `scorePair` (line 146) |
| `server/src/services/applicationEligibility.ts` | `canApply` (line 32) |
| `server/src/services/payments/adapter.ts` | `interface PaymentAdapter` (line 13) |
| `server/src/services/payments/mtnMomoAdapter.ts` | `requestPayment` (line 89) |
| `server/src/services/paymentService.ts` | `applyCallback` and its idempotency comment (lines 124–132), `refreshPending` (line 389) |
| `server/src/services/skillVerificationService.ts` | `seededPick` (line 64), `assignReviewer` (line 194) |
| `server/src/services/skillTaskService.ts` | `review` (line 296), the quorum rules (line 332) |
| `server/src/services/trustScoreService.ts` | `PRIOR_MEAN` (line 20), the shrinkage line (75) |

**Terminal**, in the repository folder, with three things ready:
1. **The full server suite, run in advance:**
   ```bash
   cd server && npm test 2>&1 | tail -5
   ```
   It takes a few minutes, so keep the result on screen; don't run it live.
2. **The end-to-end tests, run in advance:**
   ```bash
   cd client && npm run e2e:chromium
   ```
   Leave the HTML report ready with `npx playwright show-report`.
3. **The unit tests, to run live:**
   ```bash
   cd server && npx jest tests/unit
   ```
   This takes about 10 seconds.

**Browser tabs** to have open:
- https://github.com/Seyiranky/Capstone/actions, with a green CI run;
- `docs/evidence/perf/README.md` and `docs/evidence/testing.md` on GitHub.

**Your phone**, with https://isoko-web.onrender.com open: a real device for Part 9.

**Screen recording:** 1080p, the system cursor visible, notifications off.

---

## 1. Introduction (0:00 to 0:45)

**Show:** the live sign-in page.

*"This is Isoko, a skills-to-income marketplace for young people in Kigali. Workers often have real
skills, such as tailoring, phone repair, tutoring or web work, but no way to prove them to a stranger.
Isoko lets a worker prove a skill to an independent peer reviewer. It matches them to nearby jobs by
distance, trust and skill. And it pays them through MTN Mobile Money with a receipt anyone can check."*

*"It's a React and TypeScript web app talking to an Express and TypeScript API with a PostgreSQL
database. It's deployed on Render, with the database and files on Supabase, and this is the live
version. I'll walk through the main features as a client, a worker and an admin, then the testing,
performance and code."*

---

## 2. Signing in, roles and language (0:45 to 2:00)

**[C] Wrong password.** In window 1, enter `grace@isoko.demo` with the password `wrongpass`, then **Log in**.
- **Shows:** "Invalid email or password". You stay on the sign-in page.
- *"The API answers 401 and the form shows one clear message. My end-to-end tests caught this message
  appearing twice, under the form and under the Google button, and I fixed it."*

**[C] Empty form.** Clear both fields and press **Log in**.
- **Shows:** each required field is marked, and nothing is sent.

**Sign in properly** as Grace with `password123`.
- **Shows:** the client dashboard. Point at the menu: Marketplace, Find workers, Wallet, Disputes.
- *"Each role gets its own navigation. The API checks the role on every request too, not just the menu."*

**Language.** Switch to **RW** in the header.
- **Shows:** the interface in Kinyarwanda. Reload the page; it stays in Kinyarwanda. Switch back to **EN**.
- *"The interface is fully bilingual. CI fails if the English and Kinyarwanda files ever have
  different keys."*

**Optional:** Google sign-in is on the same page. Mention it, but there's no need to sign in with it.

---

## 3. The job, from gig to receipt (2:00 to 7:30)

### 3.1 The client posts a gig (2:00 to 3:00)

In window 1 (Grace), go to **Marketplace › Post a gig**.

**[C] Empty form.** Press submit with nothing filled in.
- **Shows:** the required fields are marked.

**Fill it in:**
- **Title:** `Update three pages of my salon website`
- **Skill:** Digital & Web Services
- **Budget:** a low figure first, for example `2000`.

**[C] Rate guidance.** Point at the message "This is below what most similar jobs pay…" and the usual range.
- *"Open marketplaces reward the lowest bid. Here the client sees what jobs like this actually
  paid on Isoko: the 25th percentile, median and 75th percentile of real payments."*

**Finish posting:** raise the budget into the range (for example `15000`), set the location on the map, and submit.
- **Shows:** the gig waits for an admin's review.
- *"Gigs are reviewed by an admin before workers see them. That's how it stays safe."*

### 3.2 The admin approves it, and the ranking runs (3:00 to 4:15)

In window 3 (Safari, admin), go to **Gig approvals**, find the gig and **Approve** it.

*"Approving does two things. It opens the gig, and it invites the best-ranked workers straight away."*

**Switch to VS Code:**

1. `matchScoringService.ts`, `haversineKm` and `scorePair`:
   - *"Each worker is scored for the gig on four components: distance, trust, skill fit and availability."*
   - *"Distance uses the haversine formula, the distance over the earth's surface. Its score halves every 3 km and stops at 15."*
   - *"Skill fit is 1 for a verified skill, 0.6 for one under review and 0.4 for a self-declared one."*
   - *"The weights come from a stored profile, so they can be changed for the research question about distance against trust. The score comes back with its reasons."*
2. `rankedInvitationService.ts`, `buildShortlist`:
   - *"The top three are invited, but the last place is kept for a newcomer. Otherwise the same established workers would get every invitation, and new workers could never build a record."*

### 3.3 The worker sees why, and applies (4:15 to 5:00)

In window 2 (incognito, Eric), open **Marketplace** and the new gig.

**Show "Why this ranking"**, the breakdown of the score.
- *"Workers can see why they rank where they do. There's no hidden algorithm."*

**Apply:** press **Apply to this gig**, then **Send application**.
- **Shows:** "Application sent."

**Optional, B:** open DevTools › Network before pressing **Send application** to show the `POST` request to `/api/...` and its JSON response.
- *"Every action is a JSON request to the API, which checks it, saves it and answers."*

### 3.4 The client chooses, the worker confirms and finishes (5:00 to 5:45)

**Client chooses.** In window 1 (Grace), open the gig, then the applicant's **More actions (⋯) › Approve**, and confirm.
- *"Grace is notified live over a WebSocket; there's no need to refresh."*

**Worker confirms and finishes.** In window 2 (Eric), go to **Marketplace › Your matches**. On the job, press **Confirm**, then **I've finished**, and confirm.
- *"'Your matches' sorts every job by stage, and each card shows the one next step."*

### 3.5 Mark done, pay with MTN Mobile Money, receipt (5:45 to 7:30)

**Mark done.** In window 1 (Grace), go to **Your matches**.
- **Shows:** "says the work is finished". Press **Mark job as done** and confirm.

**Pay.** Enter `0788123456` and press **Pay**.
- *"This calls MTN's real MoMo API, in its sandbox. The sandbox only accepts test money in euros
  and sends no prompt to a phone; it approves by itself."*
- Wait a few seconds. **Shows:** "Payment confirmed", and the job shows **Paid**.

**Receipt.** Press **View receipt**.
- **Shows:** the public receipt with MTN's own transaction ID.
- *"Every transaction keeps MTN's reference, so any payment can be checked against MTN's records.
  Anyone can verify the receipt from its link, without an account."*

**Switch to VS Code:**

1. `adapter.ts`, `interface PaymentAdapter`:
   - *"All payment providers sit behind this interface. The simulated provider used in tests and the
     real MTN one both implement it, and the payment service never knows which one it has. Adding
     Airtel would be one new class. That's abstraction and polymorphism."*
2. `mtnMomoAdapter.ts`, `requestPayment`:
   - *"The request-to-pay call, with our own reference as the ID."*
3. `paymentService.ts`, `applyCallback` and `refreshPending`:
   - *"MTN confirms by callback, and a background job every 10 minutes also asks MTN for any
     payment still pending, in case a callback is lost. Confirming is idempotent: a payment already
     settled is never changed again, so a duplicate callback can't pay twice."*

**Back to the admin**, in window 3: **Payments**.
- **Shows:** the badge "MTN MoMo · sandbox", the paid job, the receipt number and the masked payer number.

---

## 4. Skill verification by a peer reviewer (7:30 to 9:30)

**The worker submits evidence.** In window 2, sign out and sign in as `seyi@isoko.demo`. On the **Dashboard**, find the skill form:
- **Skill category:** Phone & Electronics Repair
- **Evidence:** attach a photo of a repaired phone, or paste a link, and add a short note.
- Press **Submit for review**.

*"The worker can't choose their reviewer. The system draws one."*

**Switch to VS Code**, `skillVerificationService.ts`, `assignReviewer` and `seededPick`:
- *"First it removes anyone who shouldn't review this worker: the worker themselves, past
  collaborators, anyone who said they know them, anyone who already saw the task, and anyone paired
  with them too often. Of those left, it keeps the least busy. Then it picks one using a SHA-256 seed."*
- *"The seed and every exclusion are saved, so an auditor can replay the draw exactly. That's the
  evidence for my research question about collusion."*

**See who was drawn.** In window 3 (admin), go to **Skill reviews**.
- **Shows:** the submission and its assigned reviewer, most likely Jean Bosco (`jeanbosco@isoko.demo`), the peer reviewer in phone repair.
- If it says it's awaiting a reviewer, say so: *"In a small pool nobody may be eligible; the
  submission is kept and the admin is asked to place it."* Then press assign, or decide it as admin.

**The reviewer decides.** In window 2, sign out and sign in as the reviewer shown. Open **Reviews** in the menu.
- **Shows:** the evidence. The reviewer never sees other reviewers' verdicts.
- Approve, with a **confidence** (1–5) and a **level**.
- **Optional:** on another submission, show **I should not review this** and its reasons ("I know this worker"…).
- *"Stepping aside records the reason and sends the task to someone else."*

**Switch to VS Code**, `skillTaskService.ts`, `review` (line 332):
- *"A first verification can need two approvals. A low-confidence verdict raises the requirement to
  two. A split decision brings in a tiebreaker, and after three rounds the majority decides."*
- *"When it's approved, the skill becomes verified and the trust score is recalculated."*

**Optional:** open `trustScoreService.ts` at line 75.
- *"The trust score pulls a worker's average toward 3.5 until they have a few reviews, and a review
  loses half its weight every six months. One five-star review can't beat twenty 4.8s."*

**Admin integrity.** In window 3, open **Integrity audit**.
- **Shows:** the flags for reviewers whose approval rates are statistical outliers, decisions taken in under 60 seconds, repeated pairings, and step-asides.

---

## 5. Rules, safety and privacy (9:30 to 10:45)

**[C] Sensitive gig.** In window 1 (Grace), post a gig titled `Maths tutoring for my daughter at home`.
- **Shows:** the form ticks "This job involves children or working inside a home" by itself.
- Approve it as admin in window 3.

**The refusal.** In window 2, sign in as `eric@isoko.demo` and open that gig.
- **Shows:** "This job needs a stronger record", with each missing item ("A confirmed phone number.") and a link to fix it. There's no Apply button.
- *"The same rule is enforced on the server. If someone sends the request directly, the API refuses
  it. The rule file is shared by the API and the web app, and CI checks the two copies are identical."*

**Safety.** On a job card, point at **Check in** and the SOS button. Don't send an SOS.
- *"On on-site jobs the worker checks in and out. An SOS texts their trusted contact and alerts every
  admin with their location."*

**Privacy.** Open **Settings**.
- Show **Download PDF / Download JSON** for data export, and the delete-account section. Don't confirm a deletion.
- Then open the public `/privacy` page.
- *"This follows Rwanda's data-protection law. Deleting an account anonymises it, but keeps receipts
  as financial records. It's refused while a job is live or money is owed."*

**Optional:** the **Fairwork scorecard**, `/fairwork`.
- *"Isoko scores itself live against the Oxford Fairwork principles, from its own records."*

---

## 6. How it fits together (10:45 to 11:30)

**Show:** README section 10, the architecture diagram, on GitHub.

*"The browser talks to the API over JSON, and over a WebSocket for live messages and notices.
The API layers are routes, then middleware for login and roles, then controllers, services and the
database models."*

*"The controllers only read the request and send the answer. The rules are in 34 services, one per
area. The database is PostgreSQL, with 72 migrations. Payments, SMS, email and file storage are each
drivers chosen by configuration, which is why tests run on simulated payments while the live site
uses MTN."*

---

## 7. Different inputs: summary (11:30 to 11:50)

*"Along the way you've seen how the system handles wrong and incomplete input:"*
- a wrong password;
- empty forms;
- a price below the usual range;
- a worker who doesn't meet a sensitive job's rules;
- a reviewer stepping aside.

*"Each is refused or warned about with a clear message, and the same checks run on the server.
The tests also cover what the screen can't show easily: duplicate payment callbacks, a failed MTN
payment, and deleting an account while money is owed."*

---

## 8. Testing strategies (11:50 to 14:00)

*"I used four kinds of testing. Every push runs the first three automatically."*

**Unit tests:** run live:
```bash
cd server && npx jest tests/unit
```
- **Shows:** 155 passing.
- *"These pin the algorithms exactly: the scoring, the trust maths, the reviewer draw and the
  collusion thresholds. For example, a past collaborator must never be drawn."*

**Integration tests:** show the result you prepared: 595 passing across 60 files.
- *"These send real HTTP requests through Express to a real PostgreSQL database: roles,
  eligibility, payments with MTN mocked, idempotency, disputes and account deletion. They made it
  safe to restructure the code. I moved the logic of two large controllers into services and
  re-ran all 595 after every move."*

**End-to-end tests:** show the Playwright HTML report.
- *"Playwright drives the real production build against the real API in real browser engines. The
  key test is the whole job journey, run as two people at once, from applying to the receipt. It
  ran on Chrome, Safari, an Android phone and an iPhone: 64 out of 64."*
- *"These tests found two real bugs. The wrong password showed its error twice. And on an
  iPhone-sized screen the Marketplace tabs were 22 pixels too wide, so the page scrolled sideways.
  Both are fixed, and the tests now guard against them."*
- Show the two fixes in `docs/evidence/testing.md`.

**CI:** show the green GitHub Actions run.
- *"Every push runs lint, typecheck, the tests, the end-to-end tests and the production build, and
  publishes the server image only if the tests pass."*

---

## 9. Performance and compatibility (14:00 to 15:15)

**Show:** `docs/evidence/perf/README.md`, the results tables.

*"Users here are on low-end Android phones and paid mobile data, so I measured on a throttled
low-end phone profile: a 4× slower CPU and slow 4G."*

*"Before, the whole app was one 3.6 MB file. The sign-in page took 6.6 seconds to show anything.
I split it so each page loads when it's first opened, moved the big libraries into separately
cached files, and compressed the API's responses. Now the first download is half the size,
558 KB, and the sign-in page shows in 3.5 seconds. The gigs list went from 68 KB to under 6 KB."*

*"The API target was 500 ms. Locally, the slowest endpoint at 25 requests at once is 156 ms. On
the live site most of the time is the 286 ms round trip to Frankfurt, not the server, which answers
in 6 to 112 ms."*

**Compatibility.** Show the browser table in `docs/evidence/testing.md`: Chromium and WebKit, desktop and phone.
- Then **hold up your phone** with the live site, or mirror it, and sign in and scroll the marketplace.
- *"Here it is on a real phone."*
- Optionally show Chrome DevTools' device toolbar at iPhone width.

---

## 10. Code quality (15:15 to 16:00)

**Show:** the repository tree on GitHub (`server/src/`: routes, middleware, controllers, services, models, lib).

*"The code follows the layered design from the proposal, in strict TypeScript, with no lint
warnings. The object-oriented core is the payment adapter interface, with the same pattern for
SMS, email and storage. The models inherit from Sequelize's Model class. A small PDF class hides
the PDF format behind simple methods to produce receipts. One error class carries HTTP statuses
from the services."*

*"The README lists every algorithm with its file and its cost."*

---

## 11. Close (16:00 to 16:20)

*"To sum up: a skill can be proven to an independent reviewer, jobs are matched on distance and
trust with the reasons shown, and workers are paid through MTN Mobile Money with a receipt.
It's tested at four levels and deployed. The next step is the pilot with 25 to 30 people in
Kimironko and Nyamirambo, to answer the research questions with real users. Thank you."*

---

## If something goes wrong while recording

| Problem | What to do |
|---|---|
| The live site is slow on the first request | It was asleep. Wait, or pause the recording and reload |
| The MoMo payment stays pending | The sandbox can be slow. Wait 10–20 s, or reload "Your matches": the background check confirms it |
| No reviewer was drawn | Explain it (the pool is small), then assign it, or decide as admin from **Skill reviews** |
| You make a mistake | Pause, go back to the start of that part, and cut it in editing |

Test data you create (gigs, jobs, submissions) stays on the live site. That's fine for a demo; it
shows up as normal activity.
