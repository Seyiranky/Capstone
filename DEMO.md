# Walkthrough video script (13 minutes)

A recording plan for the Final Version of the Product video. It covers every part of the brief's
Section 2, and shows the Section 3 code briefly so the assessor knows where to look.

| Time | Part | Brief section |
|---|---|---|
| 0:00 | 1. Introduction | |
| 0:30 | 2. Signing in, roles, language | A, **C** |
| 1:30 | 3. The job, from gig to receipt | A, B, **C** |
| 5:15 | 4. Skill verification by a peer reviewer | A, B |
| 6:45 | 5. Rules, safety and privacy | A, **C** |
| 7:45 | 6. How it fits together | B |
| 8:15 | 7. Testing strategies | **D** |
| 10:45 | 8. Performance and compatibility | **E** |
| 12:15 | 9. Code quality | Section 3 |
| 12:45 | 10. Close (ends 13:00) | |

- **[C]** marks a different-inputs moment: an error or edge case shown on screen.
- Lines in *italics* are what to say. Use your own words, but keep the points: the script is timed
  at a normal speaking pace (about 140 words a minute).
- **Running long?** Cut, in this order:
  1. the Network-tab view in 3.3;
  2. the step-aside view in Part 4;
  3. the DevTools device view in Part 8.

  Never cut parts 7 and 8: testing and performance are marked on their own.

---

## 0. Before you record (about 20 minutes; not in the video)

**Wake the live site.** Open https://isoko-api.onrender.com/health until it shows
`{"status":"ok"}`, then load https://isoko-web.onrender.com once. The free host sleeps when idle.

**Push first** (`git push`), so GitHub matches the code you show.

**Sign-ins** (password `password123` for all). Put windows 1 and 2 side by side.

| Window | Browser | Account | Role |
|---|---|---|---|
| 1 | Chrome | `grace@isoko.demo` | Client |
| 2 | Chrome incognito | `eric@isoko.demo` | Worker |
| 3 | Safari | `admin@isoko.demo` | Admin |

**Prepare Part 3's sensitive gig in advance** to save time later. As Grace, post
`Maths tutoring for my daughter at home` (Academic Tutoring), then approve it as admin.

**VS Code tabs**, in this order:
1. `server/src/services/matchScoringService.ts`: `haversineKm` (line 102) and `scorePair` (146)
2. `server/src/services/rankedInvitationService.ts`: `buildShortlist` (38)
3. `server/src/services/payments/adapter.ts`: `interface PaymentAdapter` (13)
4. `server/src/services/paymentService.ts`: `applyCallback` (124–132) and `refreshPending` (389)
5. `server/src/services/skillVerificationService.ts`: `seededPick` (64) and `assignReviewer` (194)
6. `server/src/services/skillTaskService.ts`: the quorum rules (332)

**Terminal results, run in advance** (they take minutes):
1. `cd server && npm test 2>&1 | tail -5`: keep the "595 passed" summary on screen.
2. `cd client && npm run e2e:chromium`, then `npx playwright show-report`: keep the report open.
3. Ready to run live: `cd server && npx jest tests/unit` (about 10 s).

**Browser tabs:**
- the green run at https://github.com/Seyiranky/Capstone/actions;
- `docs/evidence/testing.md` and `docs/evidence/perf/README.md` on GitHub;
- README section 10 (Architecture).

**Your phone**, with https://isoko-web.onrender.com open (Part 8).

**Recording:** 1080p, cursor visible, notifications off.

---

## 1. Introduction (0:00 to 0:30)

**Show:** the live sign-in page.

*"This is Isoko, a skills-to-income marketplace for young people in Kigali. Workers have real skills
but no way to prove them to a stranger. Here a worker proves a skill to an independent peer
reviewer, gets matched to nearby jobs, and is paid through MTN Mobile Money. This is the live
version: React in front, an Express API and PostgreSQL behind."*

---

## 2. Signing in, roles and language (0:30 to 1:30)

1. **[C] Wrong password.** In window 1, enter `grace@isoko.demo` with `wrongpass`, then **Log in**.
   - **Shows:** "Invalid email or password". You stay on the sign-in page.
   - *"The API refuses it with a 401, and the form shows one clear message."*
2. **[C] Empty form.** Clear the fields and press **Log in**.
   - **Shows:** the required fields are marked, and nothing is sent.
3. **Sign in** as Grace with `password123`. Point at the client menu.
   - *"Each role gets its own menu, and the API checks the role on every request, not just the menu."*
4. **Language.** Switch to **RW**, reload (it stays in Kinyarwanda), then switch back to **EN**.
   - *"The interface is fully bilingual, and CI fails if the two language files ever differ."*

---

## 3. The job, from gig to receipt (1:30 to 5:15)

### 3.1 The client posts a gig (1:30 to 2:10)

1. In window 1, go to **Marketplace › Post a gig**.
2. **[C]** Submit it empty. **Shows:** the required fields are marked.
3. Fill in:
   - **Title:** `Update three pages of my salon website`
   - **Skill:** Digital & Web Services
   - **Budget:** `2000`
4. **[C]** Point at "This is below what most similar jobs pay…".
   - *"Open marketplaces reward the lowest bid. Isoko shows what similar jobs actually paid here."*
5. Raise the budget to `15000`, set the map location, and submit.
   - *"An admin reviews every gig before workers see it."*

### 3.2 The admin approves, and the ranking runs (2:10 to 2:55)

1. In window 3, go to **Gig approvals › Approve**.
   - *"Approving opens the gig and invites the best-ranked workers at once."*
2. **VS Code**, `scorePair` and `haversineKm`:
   - *"Each worker is scored on distance, trust, skill fit and availability. Distance uses the
     haversine formula and its score halves every 3 kilometres. The score comes back with its reasons."*
3. **VS Code**, `buildShortlist`:
   - *"The top three are invited, but one place is kept for a newcomer, so new workers can build a
     record too."*

### 3.3 The worker sees why, and applies (2:55 to 3:25)

1. In window 2 (Eric), open the gig. Point at **Why this ranking**.
   - *"Workers see exactly why they rank where they do."*
2. Press **Apply to this gig › Send application**. **Shows:** "Application sent."
3. **Optional (B):** with DevTools › Network open, show the `POST` to `/api/...` and its JSON.

### 3.4 Choose, confirm, finish (3:25 to 3:55)

1. **Window 1 (Grace):** on the applicant, **⋯ › Approve**.
2. **Window 2 (Eric):** **Your matches › Confirm**, then **I've finished**.
   - *"Updates arrive live over a WebSocket. Each job card shows its stage and the one next step."*

### 3.5 Mark done, pay with MTN Mobile Money, receipt (3:55 to 5:15)

1. **Window 1:** **Your matches**. Point at "says the work is finished", then **Mark job as done**.
2. Enter `0788123456` and press **Pay**.
   - *"This calls MTN's real MoMo API in its sandbox, which uses test euros and approves by itself."*
   - **Shows:** "Payment confirmed" and **Paid**.
3. Press **View receipt**. **Shows:** MTN's own transaction ID.
   - *"Every payment keeps MTN's reference, so it can be checked against MTN's records."*
4. **VS Code**, `interface PaymentAdapter`:
   - *"All providers sit behind one interface. The simulated one used in tests and the real MTN one
     both implement it, so adding Airtel is one new class."*
5. **VS Code**, `applyCallback` and `refreshPending`:
   - *"MTN confirms by callback, and a background job re-checks pending payments in case one is lost.
     Confirming is idempotent, so a duplicate callback can never pay twice."*

---

## 4. Skill verification by a peer reviewer (5:15 to 6:45)

1. **Window 2:** sign in as `seyi@isoko.demo`. On the **Dashboard** skill form:
   - choose **Phone & Electronics Repair**;
   - attach a photo or paste a link;
   - press **Submit for review**.
   - *"The worker can't choose their reviewer; the system draws one."*
2. **VS Code**, `assignReviewer` and `seededPick`:
   - *"It removes anyone who shouldn't judge this worker: past collaborators, anyone who said they
     know them, earlier reviewers. It keeps the least busy, then picks with a SHA-256 seed. The
     seed and exclusions are saved, so the draw can be replayed. That's my evidence against collusion."*
3. **Window 3:** **Skill reviews** shows who was drawn, most likely `jeanbosco@isoko.demo`.
   - If none was eligible, say *"in a small pool the admin places it"* and assign it there.
4. **Window 2:** sign in as that reviewer and open **Reviews**. Approve, with a confidence and a level.
   - *"Reviewers never see each other's verdicts."*
   - **Optional:** point at **I should not review this**: stepping aside records why, then redraws.
5. **VS Code**, the quorum rules:
   - *"A low-confidence verdict needs a second reviewer, and a split decision brings in a
     tiebreaker. Approval verifies the skill and recalculates the trust score."*

---

## 5. Rules, safety and privacy (6:45 to 7:45)

1. **[C] Sensitive gig.** **Window 2:** sign in as `eric@isoko.demo` and open the tutoring gig you prepared.
   - **Shows:** "This job needs a stronger record", "A confirmed phone number.", a fix link, and no Apply button.
   - *"The form marked this sensitive by itself because it mentions a child and a home. The server
     enforces the same rule, so a direct request is refused too."*
2. **Safety:** on a job card, point at **Check in** and SOS. Don't send one.
   - *"An SOS texts the worker's trusted contact and alerts every admin."*
3. **Privacy:** in **Settings**, show the data export (**Download PDF / JSON**) and account deletion. Don't confirm it.
   - *"Under Rwanda's data law, deleting anonymises the account but keeps receipts as financial
     records. It's refused while money is owed."*
4. **Wrap up [C]:**
   - *"So wrong and incomplete input is refused with a clear message, and the tests cover the cases a
     screen can't show: duplicate callbacks and failed payments."*

---

## 6. How it fits together (7:45 to 8:15)

**Show:** README section 10, the architecture diagram.

*"The browser talks to the API over JSON, plus a WebSocket for live updates. Inside the API, a
request passes through routes, middleware for login and roles, a thin controller, then one of 34
services holding the rules, and the PostgreSQL models. Payments, SMS, email and file storage are
drivers chosen by configuration: tests use simulated payments, and the live site uses MTN."*

---

## 7. Testing strategies (8:15 to 10:45)

*"I used four kinds of testing, and every push runs the first three automatically."*

1. **Unit tests**, run live: `cd server && npx jest tests/unit`. **Shows:** 155 passed.
   - *"Why: the algorithms decide who gets work and who is trusted, so their edge cases must be
     exact. For example: a past collaborator is never drawn, and one 5-star review can't beat
     twenty 4.8s."*
2. **Integration tests:** show your prepared result, 595 passed.
   - *"These send real HTTP requests through the API to a real PostgreSQL database: roles,
     eligibility, payments with MTN mocked, idempotency and disputes."*
   - *"They made it safe to improve the code: I moved the logic of two large controllers into
     services and re-ran all 595 after each move."*
3. **End-to-end tests:** show the Playwright report.
   - *"Playwright drives the production build in real browser engines. The key test runs the whole
     job as two people at once, from applying to the receipt: 64 of 64 across Chrome, Safari, an
     Android phone and an iPhone."*
   - *"They found two real bugs. A wrong password showed its error twice. And on an iPhone the
     Marketplace tabs were 22 pixels too wide, so the page scrolled sideways. Both are fixed, and
     the tests now guard against them."*
   - Show the fixes table in `docs/evidence/testing.md`.
4. **CI:** show the green GitHub Actions run.
   - *"Every push runs lint, typecheck, all the tests and the build, and publishes the server image
     only when they pass."*

---

## 8. Performance and compatibility (10:45 to 12:15)

1. **Show:** the tables in `docs/evidence/perf/README.md`.
   - *"My users are on low-end Android phones and paid data, so I measured on a throttled low-end
     phone: a 4× slower CPU and slow 4G."*
   - *"Before, the app was one 3.6 MB file, and the sign-in page took 6.6 seconds to appear. I
     split it so pages load when opened, cached the big libraries separately, and compressed the
     API's responses. Now the first download is half the size, and it appears in 3.5 seconds."*
   - *"The API target was 500 milliseconds. The slowest endpoint takes 156 at 25 requests at once.
     Live, most of the time is the round trip to Frankfurt; the server itself answers in 6 to 112."*
2. **Show:** the browser table in `docs/evidence/testing.md`.
   - *"It's tested on Chromium and WebKit, on desktop and on emulated phones."*
3. **Hold up your phone** on the live site. Sign in and scroll the marketplace.
   - *"And here it is on a real phone."*
4. **Optional:** Chrome DevTools' device toolbar at iPhone width.

---

## 9. Code quality (12:15 to 12:45)

**Show:** the `server/src/` folders on GitHub.

*"The code is layered as the proposal planned, in strict TypeScript with no lint warnings. The
payment interface and the drivers show abstraction and polymorphism. The models inherit from
Sequelize's Model class. A small PDF class encapsulates the receipt format. The README lists every
algorithm with its file and its cost."*

---

## 10. Close (12:45 to 13:00)

*"Isoko lets workers prove skills fairly, find work and get paid by Mobile Money. It's tested and
deployed; next is the pilot in Kimironko and Nyamirambo. Thank you."*

---

## If something goes wrong while recording

| Problem | What to do |
|---|---|
| The live site is slow on the first request | It was asleep. Pause the recording, reload, then continue |
| The MoMo payment stays pending | Wait 10–20 s, or reload **Your matches**; the background check confirms it |
| No reviewer was drawn | Say why (a small pool), then assign it, or decide as admin in **Skill reviews** |
| A mistake | Pause, restart that part, and cut it in editing |

The gigs and jobs you create stay on the live site as normal activity.
