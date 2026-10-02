# Demo recording script

A 5–10 minute screen recording that **shows the software working**. The brief
says to skip the research preamble, so there is one sentence of framing and then
straight into the product.

Target: **8 minutes**. Segments are marked **[core]** (never cut) or
**[trim]** (drop first if you are running long).

---

## Before you hit record

### 1. Start the stack

```bash
# Postgres must be running on 5432
cd server && npm run dev          # tsx watch src/server.ts  → :4000
cd client && npm run dev          # Vite                     → :5173
```

For the offline segment you also need the production build in a second tab:

```bash
cd client && npm run build && npm run preview   # → :4173
```

Check all three answer before recording:

```bash
curl -s localhost:4000/health && curl -so/dev/null -w '%{http_code}\n' localhost:5173
```

### 2. Verify the state you are about to film

```bash
cd server && npx tsx -e "
const { sequelize, Gig, Match, SkillTaskAssignment } = require('./src/models');
(async () => {
  console.log('open gigs        :', await Gig.count({ where: { status: 'open' } }));
  console.log('pending matches  :', await Match.count({ where: { status: 'pending' } }));
  console.log('pending reviews  :', await SkillTaskAssignment.count({ where: { status: 'pending' } }));
  await sequelize.close();
})();"
```

You want: open gigs > 0, at least one pending match for `eric`, and at least one
pending review held by `solange`.

### 3. Browser hygiene

- One clean window, no extensions, no bookmarks bar.
- Zoom to 110–125% — table text is small at 1080p.
- Have **two profiles or a private window** ready so you can hold a worker
  session and an admin session at once without logging in and out on camera.
- Set the language to English before you start (the toggle is top-right).

### 4. Credentials

All accounts use `password123`.

| Role | Account | Why this one |
|---|---|---|
| Worker | `eric@isoko.demo` | Best-established: trust 4.25, 330,000 RWF earned, a verified skill **and** a self-declared one, plus a pending invitation to accept |
| Client | `grace@isoko.demo` | 6 completed jobs, 3 open gigs |
| Admin | `solange@isoko.demo` | **Holds two live skill reviews** — the only admin who can demo the review queue without setup |
| Newcomer | `david@isoko.demo` | Trust 2.55, zero reviews — the exploration-slot case |

---

## The script

### 0:00 – 0:25 — What it is **[core]**

On the login screen, before signing in.

> "Isoko Talents is a skills-to-income marketplace for informal workers in
> Kigali. Workers prove what they can do, clients post jobs, and the platform
> matches them and explains why. It's React and TypeScript on the front, Node,
> Express and PostgreSQL behind, TypeScript end to end."

Point at the EN/RW toggle. Do not explain the research questions.

### 0:25 – 1:30 — The worker's view **[core]**

Log in as **eric@isoko.demo**.

1. **Dashboard** — point out trust **4.2 / 5**, **330,000 RWF** earned, the 2/3
   onboarding checklist, and the two charts.
2. **Click the trust score** to open the receipt. This is the thing to dwell on:

   > "The score isn't a black box. It breaks into rating, completion and
   > verification, each with its weight, and it says the formula version. A
   > worker with no reviews shows as *unrated*, not as badly rated."

3. **Toggle RW.** Let the whole interface flip to Kinyarwanda, then flip back.

   > "Both languages, everywhere a participant goes."

### 1:30 – 3:00 — Client posts a job, admin approves it **[core]**

Switch to the **grace@isoko.demo** window.

1. **Marketplace → Post a gig.** Fill it in live:
   - Title: `Alter three wedding dresses`
   - Category: **Tailoring & Garment Making**
   - Budget: `75000`
   - **Required level: 3** ← say this out loud, it matters in a moment
   - Location: pick on the map
2. Submit. Point out it lands as **pending review**, not live.

Switch to the **solange@isoko.demo** window.

3. **Dashboard → Gig approvals → Review submissions → Approve.**

   > "The moment an admin approves it, the matching engine runs and invites a
   > shortlist automatically."

4. Go back to Grace, open the gig. **The invitations are already there.**

### 3:00 – 4:30 — Why these workers — the matching explanation **[core]**

Still as Grace, on that gig's **candidates** view. This is the strongest segment
in the demo; give it room.

1. Show the ranked list. For the top candidate, expand the breakdown:

   > "Five components — distance, trust, skill fit, credentials, availability.
   > Each shows its weight and its contribution, so the ranking is auditable."

2. Point at the **reason tags**: *exact specialisation*, *peer-reviewed*,
   *1.2 km away*, and — because you set required level 3 — *level meets* or
   *level below*.
3. Scroll to a candidate who is **not eligible** and is still listed:

   > "Workers who can't be invited still appear, with the reason. The platform
   > doesn't silently hide people."

4. **Switch the weight profile** — add `?profile=trust_first` to the URL, or use
   the profile control — and show the order change.

   > "Same candidates, different weighting, different ranking. That's the
   > experiment the project is built to run."

5. If a newcomer appears tagged **exploration**, point at it:

   > "One slot on every shortlist is reserved for someone without a track
   > record, so new workers can't be locked out by a ranking that needs history
   > they haven't been given a chance to build."

### 4:30 – 5:45 — Worker accepts, completes, gets paid **[core]**

Back to **eric@isoko.demo**.

1. **Marketplace → Your matches.** Accept the pending invitation.
2. Show the gig move to **matched**, and the other invitations withdraw.
3. Mark the match **completed**.
4. **Wallet** — show the transaction appear with its `MOMO-SIM-…` reference.

   > "Payments run through a provider adapter. This is the simulated
   > mobile-money provider — it answers *pending* and settles by callback,
   > exactly like MTN MoMo would, so swapping in the real one is a new adapter
   > file rather than a rewrite."

5. As Grace, **leave a review**. Return to Eric's profile and show the trust
   score has recomputed.

### 5:45 – 7:00 — Skill verification and provenance **[core]**

This is the part that distinguishes the project. Use **solange@isoko.demo** —
she already holds live assignments.

1. **Dashboard → Skill reviews → Review submissions.** Open one.
2. Show the evidence, then point at the assignment metadata:

   > "The reviewer was drawn, not chosen. The draw is seeded and the seed is
   > stored, so any assignment in the pilot can be reproduced. A reviewer can't
   > review someone they've worked with, or anyone they've reviewed recently."

3. **Approve it**, setting a proficiency level.
4. Open that worker's profile and show the **provenance tag** move up a tier.

   > "Four tiers: self-declared, document-sighted, peer-reviewed, work-earned.
   > The label says *sighted*, not *verified* — a reviewer saw the certificate;
   > the platform cannot authenticate the award behind it, and it doesn't claim
   > to."

### 7:00 – 7:45 — Offline and the passport **[trim]**

Switch to the **preview build on :4173** (the service worker is deliberately off
in dev).

1. DevTools → Network → **Offline**. Navigate — the shell still renders and the
   offline banner appears.
2. Mark a notification read while offline, go back online, show it replays once.
3. Try to pay while offline — it refuses rather than queueing.

   > "Applying and answering an invitation queue. Payments never do."

4. **Settings → Passport** → issue one, open `/p/:token` in a private window.

   > "A shareable, signed record a client can check without an account."

### 7:45 – 8:15 — Admin and the audit trail **[trim]**

As **solange@isoko.demo**: `/admin` → metrics and `/admin/audit`.

Show acceptance rate split by origin and invitation reason, newcomer access, and
the collusion flags with the numbers behind each one.

### 8:15 – 8:30 — Close **[core]**

> "219 backend tests, TypeScript end to end, CI running lint, typecheck, tests
> and build on every push."

Show the terminal: `npm test` green, or the green CI tick on GitHub.

---

## Things to keep off camera

These are real gaps. Don't walk into them live.

| Gap | What happens | Work around it |
|---|---|---|
| **Peer reviewers have no review UI** | The API supports peer review, but `Dashboard.tsx` only renders the review queue for `role === 'admin'`. A peer who is assigned a task sees nothing. | Do the review segment as **solange** (admin). If a fresh submission lands on a peer, it will not appear in any queue — use the two assignments solange already holds instead of submitting a new one on camera. |
| **The client cannot pick an applicant** | `PUT /gig-applications/:id/review` is admin-only. A client sees the ranked applicant list but the Approve button renders only for admins. | Demo the **ranked-invitation** path (admin approves gig → engine invites → worker accepts), not the application path. If asked, say applicant selection is currently moderated. |
| **Google sign-in** | Returns 403 on localhost — the origin isn't registered with the OAuth client. | Use email/password. Don't click the Google button. |
| **Admin screens are English-only** | Admin tables aren't translated. | Do the Kinyarwanda toggle on the **worker** dashboard and marketplace, not on `/admin`. |
| **Skill category names** | Come from the database, so they stay English in RW mode. | Don't zoom in on gig card categories while in Kinyarwanda. |
| **Re-running `npm run seed:test`** | Duplicates skill categories and breaks the suite. | Don't run it mid-demo. |

---

## If something goes wrong on camera

- **No invitations after approving a gig** — `RANKED_INVITE_LIMIT` may be `0` in
  `server/.env`. Default is 3. Restart the API after changing it.
- **A submission goes to a peer and vanishes** — reassign it to an admin:
  `PUT /api/skill-tasks/:id/assign?relax=true` as an admin.
- **Stale UI** — the service worker on :4173 caches aggressively. Hard reload,
  or use :5173 for everything except the offline segment.
- **API down** — `npm run dev` in `server/`, wait for
  `Isoko Talents API listening on port 4000`.

---

## Recording

- 1080p minimum, 30fps. Record the browser window, not the whole desktop.
- Narrate continuously; silence reads as a stall.
- Do it in **two or three takes by segment** and cut them together rather than
  chasing one perfect pass.
- Keep the terminal visible for the closing segment only.
