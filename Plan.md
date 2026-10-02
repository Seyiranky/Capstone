# Isoko Talents — Email notification channel

> Supersedes the backend TypeScript migration plan, which is built and committed.
>
> **Status: implemented** in commits `51feae8`..`8edb3d8` (2 Oct 2026). All seven
> phases landed as planned, with two deviations noted at the end. 253 tests green,
> locales at 451 keys each. Remaining follow-ups are listed in the README's
> "Before going live": the password-reset mailer, an email bounce webhook,
> server-side notification translation, and narrowing SMS to `critical`.

## Context

FR-13 promised notifications on three channels. Two exist: in-app (Socket.IO + a
`Notification` row) and SMS (`lib/channels/sms.ts`, a `log` driver by default with a real
Pindo driver behind `SMS_DRIVER`). Email was designed in from the start and never built —
the migration that created `NotificationDeliveries` says so in its own header comment, and
`DeliveryChannel` has read `'in_app' | 'sms' | 'email'` since then.

Users have no way to express a preference. `smsNotificationsEnabled` and
`emailNotificationsEnabled` exist as columns, are already in `UPDATABLE_FIELDS`, and are
**unreachable from the UI** — there is no Notifications tab in Settings, and
`UpdateProfilePayload` does not even carry the fields.

Two consequences this change addresses:

1. **Notifications don't reach people who aren't in the app.** A worker whose application
   was approved, or whose payment landed, learns about it only by opening the site. That
   is the gap FR-13 named.
2. **Every notification currently fans out to every enabled channel.** All 18 `notify()`
   call sites take the default `channels` — including "New gig application", which fires to
   *every* admin on *every* application. The README already flags this as needing a
   severity filter before launch. Adding email without one would mail that chatter too.

Outcome wanted: a user picks **one** off-app channel in Settings, the address is
**verified** before anything is sent to it, only notices worth an interruption are emailed,
and the whole thing runs end to end with **no credentials configured** so the demo and CI
are unaffected.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Preference model | **One exclusive choice**: in-app only / email / SMS | Needs a new `preferredChannel` column; the two booleans become one source of truth |
| Which notices email | **Only important ones** — money, account status, outcomes | Protects sender reputation and inbox credibility |
| Address verification | **Verify before sending** | Adds `emailVerifiedAt` + a token flow ahead of first send |
| Provider | **Brevo**, reached over SMTP | No domain is owned. Brevo is the only permanent free tier that delivers to arbitrary recipients with no domain and no card |
| Transport | `nodemailer` + SMTP, driver-selected | Every candidate provider offers SMTP, so a provider swap is four env vars, not a code change |
| Localised email | **Out of scope**, documented as follow-up | The server has no i18n catalogue; all 18 call sites interpolate hardcoded English |

---

## Provider research — why Brevo

The no-domain constraint eliminates most of the field. Verified as of 2 Oct 2026:

| Provider | Free tier | Sends to arbitrary recipients with **no domain**? |
|---|---|---|
| **Brevo** | **300/day, permanent, no card** | **Yes** — verify a sender address by emailed code, no DNS |
| SMTP2GO | 1,000/mo, permanent, no card | Yes — but **25/hour** until a domain is verified |
| Resend | 3,000/mo (100/day) | **No** — `onboarding@resend.dev` returns 403, owner's address only |
| Amazon SES | ~$0.20 for the whole pilot | **No** — sandbox needs verified recipients; exit is a manual AWS review |
| Mailgun | 100/day | **No** — sandbox domain allows 5 authorized recipients |
| Postmark | 100/mo | **No** — refuses Gmail signups outright; manual approval |
| SendGrid | 100/day for **60 days only** | Yes, but the free plan was retired in 2025 |
| Mailjet | 6,000/mo | Technically, but it does **not** rewrite the From — a Gmail sender fails DMARC |
| ZeptoMail | 10,000 trial, ~1 month | **No** — domain verification is a prerequisite |

**Brevo is the recommendation.** It is the only permanent free tier that clears the
constraint. Because a free-mail domain can never be authenticated, Brevo **rewrites the
From domain to `@brevosend.com`** so Gmail's sender rules still pass — which is precisely
why it works without DNS.

Three things to know before relying on it:

- Recipients see a `@brevosend.com` sender and a Gmail **"via brevosend.com"** label. Visibly
  unbranded in a demo. Say so on the slide rather than letting a reviewer notice it.
- Brevo gates **transactional** sending behind an activation step — possibly a support
  ticket describing the use case. Secondary sources claim it needs a verified domain;
  **Brevo's help pages block automated fetching so this is unconfirmed, and it is the one
  thing that could invalidate this choice. Sign up in week 1, not the week before the pilot.**
- Free-tier IPs are shared. Expect mostly-inbox with occasional spam-foldering; tell pilot
  participants to check spam on day one and star the first message.

**Fallback if Brevo activation stalls: SMTP2GO** (1,000/mo, permanent, no card, no domain
needed). Because both are reached over SMTP, switching is an env-var change.

At ~30 users and ~50 emails/day the pilot is far below Gmail's 5,000/day bulk-sender
threshold, where SPF *or* DKIM suffices and DMARC is optional — an authenticated shared
domain clears the bar. **No country-level signup block was found for Rwanda at any
provider**; the real friction everywhere is payment-method verification, which Brevo does
not require.

> If a domain is registered later, **Resend** becomes the better pick on developer experience
> alone (3,000/mo free, first-class TS SDK, webhooks) and `EMAIL_FROM` becomes a real Isoko
> address. The driver seam below makes that a config change plus one new driver.

---

## Phase 1 — Schema: one source of truth for the preference

A single migration, `server/migrations/<ts>-add-notification-preference-and-email-verification.js`
(migrations stay `.js` — that is the standing convention):

```js
// Up
addColumn('Users', 'preferredChannel',          { type: STRING, allowNull: false, defaultValue: 'none' });
addColumn('Users', 'emailVerifiedAt',           { type: DATE, allowNull: true });
addColumn('Users', 'emailVerificationToken',    { type: STRING, allowNull: true });
addColumn('Users', 'emailVerificationExpiresAt',{ type: DATE, allowNull: true });

// Backfill before dropping, so no expressed preference is lost. SMS wins when
// both are set: SMS is the channel that actually delivers today.
UPDATE "Users" SET "preferredChannel" =
  CASE WHEN "smsNotificationsEnabled"   THEN 'sms'
       WHEN "emailNotificationsEnabled" THEN 'email'
       ELSE 'none' END;

removeColumn('Users', 'smsNotificationsEnabled');
removeColumn('Users', 'emailNotificationsEnabled');
```

The `down` restores both booleans and repopulates them from `preferredChannel`, so the
migration is genuinely reversible.

**Why drop the booleans rather than keep them alongside.** An exclusive choice stored in two
independent flags has states the UI cannot produce (both true) and no answer for what
`notify` should do with them. One column cannot drift from itself. The cost is a destructive
step — hence the backfill-then-drop ordering and the real `down`.

`server/src/models/User.ts`:

```ts
declare preferredChannel: CreationOptional<PreferredChannel>;
declare emailVerifiedAt: Date | null;
declare emailVerificationToken: string | null;
declare emailVerificationExpiresAt: Date | null;
```

with an attribute definition mirroring `preferredLanguage` (`STRING`, default, `isIn`
validator — this codebase uses validators, not `DataTypes.ENUM`), and **two edits that are
easy to miss**:

- add `'emailVerificationToken'` to the `defaultScope` `exclude` array (line ~259) next to
  `passwordHash` and `resetToken`. It is a bearer credential for claiming an address; the
  existing comment there explains exactly this reasoning.
- widen `SafeUser` (line 95) to `Omit<User, 'passwordHash' | 'resetToken' | 'emailVerificationToken'>`.

`server/src/types/domain.ts`, beside `DeliveryChannel` at line 96:

```ts
export type PreferredChannel = 'none' | 'email' | 'sms';
export type NotificationCategory = 'activity' | 'outcome' | 'critical';
```

`server/src/controllers/userController.ts` — in `UPDATABLE_FIELDS` (line 26), replace
`'smsNotificationsEnabled'` and `'emailNotificationsEnabled'` with `'preferredChannel'`.
`updateProfile` needs no other change, **but** it currently copies any defined allowlisted
key verbatim — add a narrow guard rejecting a `preferredChannel` outside the three literals
with a 400, rather than letting the model validator surface as a 500.

Also update `server/seeders/` where the booleans are set (grep `NotificationsEnabled`) so
`eric`, who has SMS on today per `TESTING.md`, lands on `preferredChannel: 'sms'` and keeps
producing SMS delivery rows. Set `emailVerifiedAt` on the seeded accounts so the demo does
not require 15 verification clicks.

---

## Phase 2 — The email driver

New `server/src/lib/channels/email.ts`, mirroring `sms.ts` in shape, naming and tone —
including its docblock explaining that `log` is a deliberate pilot posture and not a missing
integration.

```ts
export interface EmailResult { provider: string; providerMessageId: string | null }
type EmailMessage = { to: string; subject: string; text: string; html: string };
type EmailDriver = (message: EmailMessage) => Promise<EmailResult>;

const driverName = (): string => process.env.EMAIL_DRIVER || 'log';
const fromAddress = (): string =>
  process.env.EMAIL_FROM || 'Isoko Talents <notifications@example.invalid>';

const drivers: Record<string, EmailDriver> = {
  log: async ({ to, subject, text }) => {
    console.log(`[email:log] -> ${to}: ${subject}\n${text}`);
    return { provider: 'log', providerMessageId: null };
  },
  smtp: async ({ to, subject, text, html }) => {
    // nodemailer, created per send and lazily, so SMTP_* is read at call time
    // exactly as the pindo driver reads its token — and so tests can swap it.
    const host = process.env.SMTP_HOST;
    if (!host) throw new Error('SMTP_HOST is not set');
    const transport = nodemailer.createTransport({ host, port: Number(process.env.SMTP_PORT) || 587, auth: { user: ..., pass: ... } });
    const info = await transport.sendMail({ from: fromAddress(), to, subject, text, html });
    return { provider: `smtp:${host}`, providerMessageId: info.messageId ?? null };
  },
};

/** Renders the single notification layout: plain text plus a minimal HTML twin. */
export const render = (title: string, body: string) => ({ subject: title, text: ..., html: ... });

export const send = async (message: EmailMessage): Promise<EmailResult> => {
  const name = driverName();
  const driver = drivers[name];
  if (!driver) throw new Error(`Unknown EMAIL_DRIVER '${name}'. Available: ${Object.keys(drivers).join(', ')}`);
  return driver(message);
};

export { driverName, fromAddress };
```

It **throws rather than swallows**, for the same reason `sms.ts` does (its lines 74-80 say
it outright): `notify` needs to record *why* nothing arrived.

**Why SMTP + nodemailer rather than Brevo's REST API.** Brevo's REST endpoint is a single
`fetch` POST and would mirror the `pindo` driver with zero new dependencies — more elegant,
and that is the real trade-off being made here. SMTP wins because the provider choice is
**not settled**: Brevo's transactional-activation requirement is unconfirmed, and if it
stalls the move to SMTP2GO is four env vars instead of a second driver written mid-pilot.
One dependency (`nodemailer` + `@types/nodemailer`) buys that. The REST driver stays
available as a later addition to the same `drivers` record once a provider is proven.

HTML body: inline-styled, no tables, ~30 lines — heading, body paragraph, a link to
`${APP_URL}/notifications`, and a footer line saying these can be turned off in
Settings → Notifications. That footer is the pilot's stand-in for a List-Unsubscribe header.

---

## Phase 3 — Verifying the address before first send

Verification mail is **not** a notification: it goes to someone who has expressed no
preference yet, so it calls `email.send()` directly and never touches `notify()`.

`server/src/controllers/authController.ts` — two new handlers, mirroring the
`forgotPassword`/`resetPassword` idiom already there (`crypto.randomBytes(32).toString('hex')`,
an expiry column, lookup by token):

```ts
// POST /api/auth/send-verification   (authed; `protect` middleware)
//   24h token + expiry on the user, then email.send(renderVerification(link))
//   link = `${APP_URL}/verify-email?token=${token}`
//   Cooldown: refuse with 429 if emailVerificationExpiresAt was set < 2 min ago,
//   so the button cannot be used to mail-bomb an address.
// POST /api/auth/verify-email        (public; { token })
//   find by emailVerificationToken, reject if missing/expired,
//   then update({ emailVerifiedAt: new Date(), emailVerificationToken: null, emailVerificationExpiresAt: null })
```

Register both in `server/src/routes/authRoutes.ts` beside the existing reset routes.

**Deliberately *not* returning the token in the response.** `forgotPassword` does that
(authController.ts:179-183 explains it was because no mailer existed), and it is a real hole
— anyone who knows an email gets a working reset token. Do not copy it. With
`EMAIL_DRIVER=log` the link prints to the server console, which is how the demo works.

**Google sign-in users are verified for free.** `authController.ts:140-142` already rejects
a login whose `payload.email_verified` is false, and then throws the fact away. Set
`emailVerifiedAt: new Date()` on the user it creates (and on an existing user whose
`emailVerifiedAt` is null). Google has already done the work; asking those users to confirm
again would be theatre.

Dependency ordering to keep in mind: **Phase 2 must land before Phase 3**, since
verification needs a mailer, and Phase 3 before email delivery is switched on in Phase 4.

> Once `email.ts` exists, the highest-value follow-up is making `forgotPassword` actually
> mail its link instead of returning the token. **Keep it out of this change** — it widens the
> diff into auth and deserves its own commit. Record it in the README.

---

## Phase 4 — Teaching `notify` about email

Three edits to `server/src/lib/notify.ts`, with **no behavioural change to in-app or SMS**.

**1. Category in, channels out.** New `server/src/lib/channels/policy.ts`:

```ts
/** Transport is a property of the kind of notice, not of the controller that sends it. */
const POLICY: Record<NotificationCategory, DeliveryChannel[]> = {
  activity: ['in_app', 'sms'],            // today's default, byte for byte
  outcome:  ['in_app', 'sms', 'email'],
  critical: ['in_app', 'sms', 'email'],
};
export const channelsFor = (category: NotificationCategory = 'activity') =>
  POLICY[category] ?? POLICY.activity;
```

`NotificationFields` gains `category?: NotificationCategory`. **It is not a column** — line 82
is `Notification.create(fields)`, so it must be destructured out or Sequelize carries a stray
attribute:

```ts
const { category, ...attributes } = fields;
const { channels = channelsFor(category) } = options;
const notification = await Notification.create(attributes);
```

An un-annotated call site therefore resolves to exactly `['in_app', 'sms']` — today's
literal. That equality is worth a test, because it is the whole regression argument.

`outcome` and `critical` resolve identically right now. Keep them distinct anyway: `critical`
is the hook for narrowing *SMS* once Pindo is billed per segment, which is the filter the
README already asks for.

**2. One user fetch for both off-app channels**, replacing lines 96-102:

```ts
const needsUser = channels.includes('sms') || channels.includes('email');
const user = needsUser
  ? await User.findByPk(fields.userId, {
      attributes: ['id', 'phone', 'email', 'preferredChannel', 'emailVerifiedAt'],
    })
  : null;

if (channels.includes('sms'))   void deliverSms(notification, user);   // deliberately not awaited
if (channels.includes('email')) void deliverEmail(notification, user); // same reason
```

Keep the "Deliberately not awaited" comment and extend it: an HTTP request should not wait on
an SMTP handshake either.

**3. `deliverEmail`**, structurally identical to `deliverSms` (lines 40-68), recording every
outcome — the point of `recordDelivery` is that a pilot can tell "did not want email" from
"tried and failed":

| Condition | row |
|---|---|
| `user?.preferredChannel !== 'email'` | `skipped`, `'not opted in'` |
| `!user.emailVerifiedAt` | `skipped`, `'email not verified'` |
| `!user.email` | `skipped`, `'no email address'` (unreachable — column is NOT NULL — kept for symmetry) |
| sent | `sent` + `provider`, `providerMessageId`, `sentAt` |
| threw | `failed` + `provider: email.driverName()`, error message |

`deliverSms`'s opt-in check changes from `!user?.smsNotificationsEnabled` to
`user?.preferredChannel !== 'sms'`. Same semantics for every existing row after the backfill.

Email passes the **title as subject** and body as body — the SMS comment about keeping to one
billable segment does not apply. Comment the divergence so it reads as intentional.

**No migration for the delivery table.** `channel` is already a plain `Sequelize.STRING` with
no DB enum, and `NotificationDelivery.ts:49` already validates
`isIn: [['in_app','sms','email']]`.

---

## Phase 5 — Mark the notices worth an email

Eight one-line additions. Not 18, and not a `channels` array in a controller.

| File:line | Title | add |
|---|---|---|
| `webhookController.ts:77` | Payment confirmed / failed | `category: 'critical'` |
| `adminController.ts:282` | Account suspended / reactivated | `category: 'critical'` |
| `adminController.ts:144` | Gig approved / rejected | `category: 'outcome'` |
| `gigApplicationController.ts:139` | Application not selected | `category: 'outcome'` |
| `gigApplicationController.ts:161` | Application approved | `category: 'outcome'` |
| `skillTaskController.ts:367` | Skill verified / rejected | `category: 'outcome'` |
| `matchController.ts:152` | Worker confirmed | `category: 'outcome'` |
| `matchController.ts:166` | Worker declined / Match cancelled | `category: 'outcome'` |

Left as `activity` **on purpose** — `gigApplicationController.ts:82` ("New gig application",
fires to every admin on every application), both "needs manual assignment" notices
(`skillTaskController.ts:190,513`), `matchController.ts:136,144`, `reviewController.ts:61`,
`adminController.ts:90`, and `adminController.ts:247` ("You were matched to a new gig" — high
user value, but ranked matching sends several invites per gig, so it is also the highest
volume). Promoting any of these later is a one-word diff.

---

## Phase 6 — Client

**`client/src/api/userApi.ts`** — widen `UpdateProfilePayload` (lines 4-13). This is the hard
blocker; the toggle cannot be sent without it:

```ts
preferredChannel?: 'none' | 'email' | 'sms';
/** Null clears the number; undefined leaves it untouched. */
phone?: string | null;
```

**`client/src/types/index.ts`** — replace `smsNotificationsEnabled` / `emailNotificationsEnabled`
(lines 62-63) with `preferredChannel?: 'none' | 'email' | 'sms'` and add
`emailVerifiedAt?: string | null`.

**New `client/src/components/Settings/NotificationPreferences.tsx`** — its own component, not
folded into `ProfileEditor`: that is one submit-button form, and a preference should take
effect on change.

- `Radio.Group` over three options: in-app only / Email / SMS, bound to
  `profile?.preferredChannel ?? 'none'`.
- **SMS rendered `disabled`** with a "coming soon" hint — the ask shown honestly: the shape
  exists, SMS is dated. A user already on `'sms'` (seeded `eric`) still displays as selected
  and still receives SMS; they simply cannot newly choose it.
- Choosing Email when `emailVerifiedAt` is null shows an `Alert` with a **Verify my address**
  button → `POST /auth/send-verification`, and the copy states plainly that no email will be
  sent until the address is confirmed. Show the destination address read-only so the user
  knows where it goes before opting in.
- On change: `userApi.updateProfile({ preferredChannel })` → `await dispatch(fetchCurrentUser())`
  → `message.success(t('settings.saved'))`, with a loading flag during the round trip and a
  revert + `message.error` on failure. That is the save idiom `ProfileEditor` already uses.

**New `client/src/pages/VerifyEmailPage.tsx`** + a public route `/verify-email` in the router,
alongside the existing `/forgot-password`. Reads `?token=`, posts it, shows success or an
expired-link message with a path back to Settings.

**`client/src/components/Settings/Settings.tsx`** — append a fifth tab after `data` (index 4):
`{ key: 'notifications', label: <Space size={8}><BellOutlined />{t('settings.notifications.title')}</Space>, children: <Card …><NotificationPreferences /></Card> }`.
**Leave the `role === 'worker'` splices at lines 125/135 untouched** — they insert at indices
1 and 2 positionally. Add a one-line comment above them saying so, so the next person does not
insert above them.

**i18n** — add the same leaf keys to **both** `en.json` and `rw.json` under
`settings.notifications`: `title`, `desc`, `inAppAlways`, `emailLabel`, `emailHint`, `sentTo`,
`verifyCta`, `verifyPending`, `verifySent`, `smsLabel`, `smsSoon`, plus `verifyEmail.*` for the
page. Both files are at 428 keys; they must stay equal.
`node scripts/check-i18n-parity.mjs` gates this in CI and also **warns on identical en/rw
values**, so write real Kinyarwanda rather than English placeholders. As with the ~40 strings
from the last i18n pass, these want a native-speaker review before the pilot.

---

## Phase 7 — Env vars and documentation

| Variable | Purpose | Default |
|---|---|---|
| `EMAIL_DRIVER` | `log` today; `smtp` once a Brevo sender is verified | `log` |
| `EMAIL_FROM` | `From` header. With Brevo and no domain this is rewritten to `@brevosend.com` | placeholder |
| `SMTP_HOST` | `smtp-relay.brevo.com` | — |
| `SMTP_PORT` | | `587` |
| `SMTP_USER` / `SMTP_PASS` | Brevo SMTP login + key | — |
| `APP_URL` | Base URL for the links in emails | `http://localhost:5173` |

All optional and read lazily per call, so **the server boots and the feature works end to end
with nothing configured**. `assertRequiredEnv()` in `config/env.ts` is untouched.

README: add these rows to the env table (~line 494, under `SMS_DRIVER`); note that
`PINDO_API_TOKEN` / `SMS_SENDER_ID` are currently undocumented there and should be added in the
same pass. Add an **Email** bullet to "Before going live" covering the Brevo activation risk,
the missing bounce webhook, and the `forgotPassword` follow-up. Amend the existing
"Notification volume" bullet to say the severity filter it asks for now exists as
`NotificationCategory`, and is the hook for narrowing SMS.

`config/env.ts:24-27` tells the operator to "see `.env.example` for the full list" and **that
file does not exist**. Create `server/.env.example` listing every variable in the README table.
It is the first place a new contributor looks, and it makes the existing error message true.

**Bounces.** With `log` there are none. With `smtp`, rejections at submit time already land as
a `failed` `NotificationDelivery` row carrying the provider error — the audit trail
`recordDelivery` was written for. Asynchronous bounces need a provider webhook and are out of
scope; at 30 users the mitigation is operational. Add to the README as the pilot's delivery
health check:

```sql
SELECT channel, status, error, count(*) FROM "NotificationDeliveries"
WHERE channel = 'email' GROUP BY 1,2,3 ORDER BY 4 DESC;
```

**Localisation is out of scope, deliberately.** The server has no i18n library and no
catalogue; all 18 call sites interpolate hardcoded English. Translating only email would make
the email better-localised than the in-app notification generated from the same row. The right
fix is a server-side message catalogue keyed by notification type at the `notify` layer,
serving all three channels at once — a separate, larger change. Record it as a follow-up.

---

## Tests

Nothing covers `notify` or `sms` today (`server/tests/**` has zero matches), so these establish
the pattern. ts-jest with `diagnostics: false`, `--runInBand`.

**`tests/unit/emailChannel.test.ts`** — pure, no Postgres. Save/restore `process.env` around
each test; stub the transport.
- no env set → driver is `log`, returns `{provider:'log', providerMessageId:null}`, sends nothing
- `EMAIL_DRIVER=nope` → throws `Unknown EMAIL_DRIVER 'nope'. Available: log, smtp`
- `EMAIL_DRIVER=smtp` with no `SMTP_HOST` → throws `SMTP_HOST is not set`
- smtp happy path → `from` comes from `EMAIL_FROM`; returns the provider `messageId`
- smtp rejection → throws, message preserved
- `render()` → subject is the title, text contains the body, html contains the body and the
  `APP_URL` link

**`tests/unit/notificationPolicy.test.ts`** — `channelsFor(undefined)` is **exactly**
`['in_app','sms']` (the regression guard for the 10 un-annotated call sites); `outcome` and
`critical` include `email`; an unknown value falls back to activity.

**`tests/integration/notifyEmail.test.ts`** — DB-bound, following the `trustScoreService.test.ts`
idiom (`import db from '../../src/models'`, per-test users with randomised emails, cleanup by
collected ids). Call `notify` with `req = undefined` so no Socket.IO is needed.
- verified + `preferredChannel:'email'` + `category:'critical'` → `email` row `sent`, provider `log`, `sentAt` set
- `preferredChannel:'none'` (the default) → `skipped` / `'not opted in'`
- `preferredChannel:'email'` but `emailVerifiedAt` null → `skipped` / `'email not verified'`
- `category` omitted → **no `email` row at all**, and the `in_app` + `sms` rows are unchanged
- unknown `EMAIL_DRIVER` → `failed` with the provider name and the thrown message
- `category` is not persisted onto the `Notification` row (guards the destructure)

**`tests/integration/emailVerification.test.ts`** — send-verification sets a token and expiry;
verify-email with it sets `emailVerifiedAt` and clears the token; a second use of the same token
fails; an expired token fails; a resend inside the cooldown returns 429; the token never appears
in any response body.

**The race to plan for:** `deliverEmail` is `void`-ed, so its row appears *after* `notify`
resolves. Add a polling helper to `tests/helpers/fixtures.ts`:

```ts
/** Delivery is dispatched without being awaited, so assertions must wait for it. */
export const waitForDeliveries = async (notificationId, channel, { tries = 40, ms = 25 } = {}) => { /* poll, then throw a readable timeout */ };
```

Do **not** make `deliverEmail` awaited just to simplify the test — that would add SMTP latency
to a user-visible action.

---

## Verification

1. `cd server && npm run typecheck && npm run lint`
2. `npm run migrate` then `npm run seed`; confirm `eric` reads `preferredChannel = 'sms'` —
   proof the backfill preserved the one expressed preference in the data
3. `npm run migrate:undo` once → both booleans come back with the right values → `migrate` again
4. `npm test` — new files pass, nothing regresses. `tests/integration/api.test.ts` exercises
   several `notify` paths and is the real guard that the single-fetch refactor is behaviour-neutral
5. `node scripts/check-i18n-parity.mjs` → equal counts, no new untranslated warnings
6. `cd client && npm run build`
7. **Manual, no credentials.** Both dev servers up. Log in as `david@isoko.demo` →
   Settings → **Notifications** → pick Email → the unverified alert appears → **Verify my
   address** → the link prints to the server console as `[email:log] -> …` → open it →
   the page confirms → Settings shows verified. As a worker, confirm **Credentials** and
   **Passport** are still the 2nd and 3rd tabs and Notifications is last.
8. Trigger a `critical` notice — admin-suspend a test user (`adminController.ts:282`) or post the
   payment webhook against a seeded transaction. Console shows `[email:log]`;
   `SELECT * FROM "NotificationDeliveries" WHERE channel='email'` shows `sent` / `log`.
9. Switch back to in-app only, repeat → row is `skipped` / `'not opted in'`.
10. **The noise check:** apply to a gig as a worker (`gigApplicationController.ts:82`, the
    per-admin fan-out) → **no `email` rows**, with an opted-in verified admin.
11. With a real Brevo key: `EMAIL_DRIVER=smtp SMTP_HOST=smtp-relay.brevo.com SMTP_USER=… SMTP_PASS=…`
    → mail arrives at a Gmail address (**check spam**), `providerMessageId` populated. Then a bad
    password → `failed` row carrying the provider message.

---

## Commits

Incremental and narrative, explaining why.

1. Migration + `User` model + `domain.ts` + `UPDATABLE_FIELDS` + seeders — *"Store one notification preference instead of two flags"* (why: an exclusive choice in two booleans has states the UI cannot produce)
2. `lib/channels/email.ts` + its unit tests — *"Add an email driver that works with no credentials"* (why `log` is the default; why SMTP over a provider REST API)
3. Auth handlers, routes and tests for verification — *"Confirm an address before sending anything to it"* (why the token is not returned in the response; why Google users are verified for free)
4. `policy.ts` + `notify.ts` + integration test — *"Deliver notifications by email when the recipient asked for it"* (why one user fetch; why delivery is not awaited; why localisation waits)
5. The eight `category:` annotations — *"Mark the notices worth an email"* (why each omission was omitted)
6. Client: `userApi.ts`, `types/index.ts`, `NotificationPreferences.tsx`, `VerifyEmailPage.tsx`, `Settings.tsx`, both locales — *"Let people choose how they hear from us"* (why a live toggle rather than the profile form; why SMS is shown disabled)
7. README env table, `.env.example`, "Before going live" — *"Document the email channel and what it still needs"*

## Not in scope

Localised notification bodies; a bounce/complaint webhook; making `forgotPassword` mail its
link; SMS preference selection (the option ships disabled); per-category preferences; and any
change to in-app or SMS delivery behaviour.

---

## Deviations from the plan as written

Two, both recorded here rather than silently absorbed:

1. **`notify.ts`'s SMS opt-in check moved into Phase 1** rather than Phase 4.
   Dropping the boolean columns stops the file compiling, and every commit has to
   build on its own, so the one-line rename travelled with the schema change.

2. **"Worker selected" was annotated and then reverted** to `activity`. It fires
   from the client's own click to approve an application, so emailing it reports
   their own action back to them, and "Worker confirmed" covers the same hiring
   event once it actually resolves. Eight call sites carry a category, as planned.

One addition the plan did not call for: `render()` escapes the notification title
and body into the HTML part. Titles interpolate gig titles and user names, so a
quote or an angle bracket from a real listing would otherwise break the markup.
