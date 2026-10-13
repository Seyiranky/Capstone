# Isoko Talents — End-to-end manual test guide

Every login below was verified against a running server on 2026-09-13. The
password is the same for all fifteen seeded accounts:

```
password123
```

## Start the stack

```bash
# Postgres 18 must be running on 5432
cd server  && npm run migrate && npm run seed && npm run dev   # http://localhost:4000
cd client  && npm run dev                                      # http://localhost:5173
```

`npm run seed` chains `trust:backfill` and `reviewers:enrol`, so workers hold
scores they have earned and the peer-reviewer pool is populated. Without it,
every worker reads 5.00 beside "no reviews yet" and no rotation is possible.

## Running the tests

```bash
cd server && npm run typecheck && npm test
```

`npm test` needs the test database migrated and seeded once:

```bash
npm run migrate:test && npm run seed:test
```

**Run `seed:test` only once per database.** The seeder is not idempotent — a
second run inserts a duplicate set of the four skill categories, and the suite
then fails with `Expected length: 1, Received length: 2` because it looks up a
category by name. CI is unaffected (it builds a fresh database each run). To
recover locally, delete the duplicates rather than re-seeding:

```sql
DELETE FROM "Skills" WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY category, kind ORDER BY "createdAt") rn
    FROM "Skills"
  ) s WHERE rn > 1
);
```

To test the PWA and offline behaviour you need the **production build**, because
the service worker is deliberately disabled in dev (a cached shell hides the
change you just made):

```bash
cd client && npm run build && npm run preview   # http://localhost:4173
```

---

## Accounts, and what each one is for

### Admins — `/admin`, skill reviews, gig approvals, metrics

| Login | Use it to test |
|---|---|
| `emmanuel@isoko.demo` | The main admin. Metrics, audit, gig approvals. |
| `admin@isoko.demo` | Holds a **pending skill review** (seyi, Academic Tutoring). |
| `solange@isoko.demo` | Holds **two pending reviews** (seyi tutoring, david web). |
| `abu@isoko.demo` | Holds a **pending review** (david, Digital & Web). |

Three of these were drawn by the rotation, so they are also how you observe RQ1
working: `solange` and `admin` were assigned to the *same* task, which is the
2-approval quorum.

### Clients — post gigs, see ranked candidates, pay, review

| Login | State |
|---|---|
| `grace@isoko.demo` | Busiest client — 6 reviews, 6 completed jobs, 3 open gigs. |
| `diane@isoko.demo` | Has a gig **awaiting admin approval** (`Weekend French lessons`). |
| `robert@isoko.demo` | 2 open repair gigs. |
| `samuel@isoko.demo` | Lowest client trust (3.41); has the abandoned gig. |

### Workers — apply, verify skills, get paid

| Login | Trust | Reviewer? | State — why you'd pick this one |
|---|---|---|---|
| `eric@isoko.demo` | 4.25 | **peer** | Best-established worker. Verified web skill (`peer_reviewed`, 0.80) **plus one self-declared specialisation** — the only account where you can see both provenance tiers side by side. |
| `aline@isoko.demo` | 4.26 | **peer** | Highest trust. Verified tailoring. Has a revoked passport to test revocation. |
| `claudine@isoko.demo` | 4.12 | **peer** | Verified tutoring. |
| `jeanbosco@isoko.demo` | 4.01 | **peer** | Verified electronics repair. |
| `patrick@isoko.demo` | 3.21 | no | Deliberately weaker: 2 reviews, one abandonment. Use to check the ranking actually separates people. |
| `david@isoko.demo` | 2.55 | no | **Zero reviews, zero jobs, two pending submissions.** The newcomer — use this account for the exploration slot. |
| `seyi@isoko.demo` | 3.55 | no | Verified web skill, two pending tutoring submissions. |

Note `patrick`, `david` and `seyi` have **no** `reviewerTier`: they sit below
`PEER_MIN_REVIEWS`, so the rotation will not draw them. That is the RQ1 rule
that a score resting on the prior is not a track record.

---

## Walkthrough per role

### 1. Worker — from nothing to paid

Log in as **`david@isoko.demo`** (the newcomer).

1. **Dashboard** → the onboarding checklist should show incomplete steps.
2. **Settings → Skills** → self-declare a skill. Confirm it appears as
   `self_declared` with a visibly *small* credential contribution, not as
   "unverified" with nothing.
3. **Dashboard → Add skill** → submit a demonstration with photo or voice
   evidence. Confirm the assignment that comes back carries a seed and a pool
   size, and that the reviewer is **not** david and **not** anyone he has worked
   with.
4. **Marketplace** → apply to an open gig. Check `MatchExplanation` shows all
   five components with reasons, in your chosen language.
5. Have a client invite and confirm you (below), then **Wallet** → confirm the
   payment lands and the income statement reflects it.
6. **Settings → Passport** → issue a passport, open `/p/:token` in a private
   window, then revoke it and confirm the public page stops verifying.

To see the *established* side instead, repeat from step 4 as **`eric`**.

### 2. Client — post, rank, pay

Log in as **`grace@isoko.demo`**.

1. **Post a gig.** Set `requiredLevel: 4` on one and leave it unset on another.
2. Log in as an admin to approve it (gigs start `pending_review` — `diane`
   already has one waiting if you want to skip this).
3. Open the gig → **candidates**. Confirm:
   - five components per candidate, none `NaN`;
   - the *qualified* worker ranks above unqualified ones even if they are
     further away (eligible-first sorting);
   - a self-declared level 5 does **not** clear `requiredLevel: 4`.
4. Invite the shortlist. Confirm the last slot carries
   `invitationReason: 'exploration'` and goes to a newcomer like `david`.
5. When the worker accepts → **Pay with MoMo** puts the agreed price in escrow → hand the
   worker the 4-digit completion code shown on the match card → review. (See section 7.)

### 3. Peer reviewer — **currently API-only, see the gap below**

Log in as **`claudine@isoko.demo`** or **`eric@isoko.demo`**.

The server side works. With a token:

```bash
curl "http://localhost:4000/api/skill-tasks?assignedToMe=true" -H "Authorization: Bearer $TOKEN"
curl -X PUT "http://localhost:4000/api/skill-tasks/$TASK_ID/review" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"decision":"approved","confidence":"high","notes":"Work matches the claim."}'
```

Confirm afterwards that the worker's `provenance` moves up a tier, that
`credentialStrength` rises, and that their ranking on a matching gig improves.

### 4. Admin — approvals, rotation, metrics

Log in as **`solange@isoko.demo`** (she has two live assignments).

1. **Dashboard → Skill reviews → Review submissions** → decide one. A task
   needing 2 approvals should stay `pending` until the second reviewer agrees.
2. **Dashboard → Gig approvals** → approve `diane`'s French lessons gig and
   watch ranked invitations fire.
3. **`/admin/audit`** → check the collusion flags. Only assignments carrying an
   `assignmentSeed` are judged on review speed, so seeded fixtures should not be
   flagged.
4. **`GET /api/admin/metrics`** → acceptance rate by origin *and* by
   `invitationReason`, `newcomerAccess`, `experimentAllocation`, review
   turnaround.

### 5. Offline and SMS

Against the **preview build on :4173**, logged in as `eric`:

1. DevTools → Network → Offline. Navigate — the shell should still render and
   the offline banner appear.
2. Accept a match or mark a notification read while offline → it queues.
3. Go back online → confirm it replays exactly once, and that `occurredAt`
   preserves the real decision time rather than the replay time.
4. Try to pay while offline → it must **refuse**, not queue.
5. `SELECT * FROM "NotificationDeliveries" ORDER BY "createdAt" DESC;` →
   every attempt is recorded, including `skipped` for workers with no phone.

### 5b. Email notifications

No mail account is needed: `EMAIL_DRIVER` defaults to `log`, which prints the
whole message — including verification links — to the server console.

As any worker, e.g. **`david@isoko.demo`**:

1. **Settings → Notifications** → choose **Email**. A warning appears saying
   nothing will be sent until the address is confirmed.
2. **Send me a link** → the server console prints `[email:log] -> …` with a
   `/verify-email?token=…` URL. Open it. The page confirms and Settings then
   shows the address as verified. Pressing the button twice inside two minutes
   is refused with a 429.
3. Trigger something **critical** — have an admin suspend a test account, or
   post the payment webhook for a seeded transaction. The console shows the
   email and:

   ```sql
   SELECT d.channel, d.status, d.provider, d.error
     FROM "NotificationDeliveries" d
     JOIN "Notifications" n ON n.id = d."notificationId"
    WHERE n."userId" = '<user>' ORDER BY d."createdAt";
   ```

   should show `in_app` sent, `sms` skipped (`not opted in`) and `email` sent.
4. Switch back to **In the app only** and repeat → the email row is `skipped`
   with `not opted in`, not absent. The distinction is the point: a pilot has to
   tell "did not want email" from "tried and failed".
5. **The noise check.** Opt an *admin* into verified email, then apply to a gig
   as a worker. "New gig application" fires to every admin, and it must produce
   **no email row at all** — only notices carrying a `category` are emailed.

### 5c. SMS notifications

No gateway account is needed: with `SMS_DRIVER=log` (the default) every text,
including the confirmation code, is printed to the server console as
`[sms:log] -> +2507… (1 segment): …`.

As any worker, e.g. **`david@isoko.demo`**:

1. **Settings → Notifications** → choose **SMS**. Nothing is saved yet; a box
   asks for a number. Type `0252 123 456` → it is refused (landline). Type
   `788 123 456` → **Send code**. The button counts down from 60 s.
2. Copy the six digits from the server console line `Isoko code: …`. Type a
   wrong code first → "That code is not right. 4 tries left." Then the right one
   → SMS is selected and the number shows masked, `+250 78• ••• 456`.
3. Trigger something **outcome** or **critical**: approve one of this worker's
   applications as the gig's client, or have an admin suspend and reactivate a
   test account. The console prints one line starting `Isoko:` and reporting
   `(1 segment)`, however long the gig title. The SQL from 5b shows `sms` sent
   with `provider = log` and `segments = 1`.
4. **The noise check.** Opt an *admin* into SMS the same way, then apply to a gig
   as a worker. "New gig application" must produce **no `sms` row at all**:
   only notices carrying a `category` are texted.
5. **Change number** → send a code to `0722 123 456`. Until it is confirmed,
   notices are recorded as `skipped` with `phone not verified`.
6. **Admin → Overview → SMS, last 7 days** shows delivered, failed, awaiting
   report, cost and the last known balance.

**Live, through Pindo:** set `SMS_DRIVER=pindo`, `PINDO_API_TOKEN` and
`SMS_SENDER_ID=PindoTest` in `server/.env` and restart the API. First check
the account alone with `npm run sms:test -- 07XXXXXXXX` from `server/`, then
repeat steps 1–3 with your own phone. To see delivery reports arrive locally,
expose the API with a tunnel (`cloudflared tunnel --url http://localhost:4000`)
and set Pindo's DLR webhook to `<tunnel>/api/webhooks/sms/pindo?secret=<SMS_WEBHOOK_SECRET>`;
the row moves from `sent` to `delivered`. Each live text costs about $0.01, so
switch test accounts back to **In the app only** afterwards.

### 6. Language parity

Switch to Kinyarwanda in **Settings → Appearance** and re-walk the worker
journey. Every scoring reason and provenance tier must render translated —
they are emitted as i18n keys with params, never as server-rendered sentences.
`node scripts/check-i18n-parity.mjs` gates this in CI.

### 7. Escrow, receipts, disputes and the rest of the October features

Each step names the account to use. All money is simulated.

1. **Quote** — as **`claudine`**, open *Tailor 20 school uniforms*, **Apply**, and quote
   20,000. The usual-range hint appears and warns that the price is low. As **`grace`**
   posting a gig, a low budget gets the client version of the same warning.
2. **Escrow and the code** — approve an application as **`emmanuel`**, accept it as the
   worker. On **Marketplace → Your matches** the client sees *Pay into escrow*; after paying,
   the card shows a 4-digit **completion code**. The worker's card shows an entry box. A
   wrong code says how many tries are left; after 5 it locks. The right code completes the
   job and releases the money; **Wallet** shows it as *Released*.
3. **Receipt** — the completed match card links to `/r/ISK-…`. Open it in a private window:
   it loads without an account, with a QR code and a Print button.
4. **No code to hand over** — the worker taps *Client not here? Report the job done*. The
   card shows when it will release on its own (72 hours). The sweep runs every 10 minutes.
5. **Dispute** — on a funded job, *Open a dispute* from either side. The money freezes and
   the card says so. **Disputes** in the sidebar: the other party adds their side; the panel
   votes (two matching votes decide); an admin decides escalated ones and must give a reason.
   With the demo accounts most disputes go straight to an admin, because only one member is
   eligible to mediate for Robert and Jean Bosco (see Plan.md, Phase 3).
6. **Job photos and work history** — on an in-progress or completed match the worker adds up
   to 3 photos. Once paid, the job appears under **Work history** on their profile, with the
   rating, photos and receipt link. The passport shows paid jobs per skill.
7. **Rejection reasons** — reject an application as **`emmanuel`**: a reason is required.
   The worker sees it under **My applications**; *skill level* links to the add-skill form.
   **Admin → Overview** counts reasons by skill.
8. **Photos in messages** — two browsers, **`grace`** and **`eric`**. Grace sends a photo from
   **Notifications → Messages**; Eric, on any other page, gets a pop-up that opens the
   conversation. Grace's side then shows *Seen*.

---

## Known gap: peer reviewers have no review UI

The API supports peer reviewers fully — `requireReviewer` gates on
`reviewerTier`, not on `role`, and `listTasks` has a working
`assignedToMe=true` branch for them. The **client never asks for it**:

- `client/src/components/Dashboard/Dashboard.tsx:57` sends
  `assignedToMe: true` only when `role === 'admin'`. A peer reviewer is a
  `worker`, so the server falls through to the `else` branch and returns *their
  own submissions* instead of their review queue.
- `client/src/components/Dashboard/Dashboard.tsx:265` renders the review card
  only when `role === 'admin'`.

Verified live: `claudine` with `assignedToMe=true` gets her queue; the request
the UI actually makes returns her own approved task instead.

This matters beyond convenience. RQ1's collusion-resistance claim rests on
review being done by *rotated peers* rather than by staff, and today every
review in the UI must be done by an admin — which is the single reviewer pool
the rotation exists to avoid.
