# Isoko Talents — SMS notifications through Pindo

> Supersedes the email notification channel plan, which is built and committed
> (`51feae8`..`8edb3d8`, 2 Oct 2026). That plan's text is in git history.
>
> **Status: planned** (10 Oct 2026). Nothing below is implemented yet.
> Provider research behind the choice: `reports/SMS provider for Isoko Talents.md`.

## Context

FR-13 promised notifications on three channels. In-app and email are live. SMS has been
**built but switched off** since September:

- `server/src/lib/channels/sms.ts` has a `log` driver (the default) and a `pindo` driver
  behind `SMS_DRIVER`. The Pindo driver has never sent a real message.
- `notify.ts` already calls `deliverSms()` for every category, and records a
  `NotificationDelivery` row whatever happens.
- `User.preferredChannel` can already hold `'sms'`, but the Settings radio for SMS is
  **disabled** ("Not available yet.") unless the user is already on it.

What stops SMS from going live today:

1. **There is no way to enter a phone number.** `phone` is in `UPDATABLE_FIELDS` and in the
   client types, but no screen edits it.
2. **Numbers are never verified.** Email gets a confirmation link before anything is sent to
   it. SMS sends to whatever `phone` holds, so a typo bills Isoko for messages to a stranger.
3. **Numbers are not validated.** `normaliseMsisdn()` turns any string into `+<digits>`,
   so `"hello"` becomes `+` and is sent to Pindo, which rejects it with `409`.
4. **Text is not made safe for SMS.** Kinyarwanda needs no accents, so it fits GSM-7 at 160
   characters a segment. A single curly apostrophe (`n’`) forces UCS-2 at 70 a segment and
   can turn one billed segment into three. The driver passes text through unchanged.
5. **"Sent" is the last thing we know.** Pindo reports delivery (`DELIVRD`, `UNDELIV`, …) to
   a webhook, but there is no endpoint to receive it, so a pilot can't report whether
   anyone was actually reached.
6. **Every notification goes to SMS.** The policy table still sends `activity` notices
   (including the "new application" fan-out to every admin) by SMS. That was harmless on
   the `log` driver; on Pindo every one is billed.
7. **The driver has no timeout.** `fetch` to Pindo can hang for as long as the socket allows.

Outcome wanted: a user enters a Rwandan mobile number, confirms it with a code, chooses
SMS, and receives only the notices worth paying for, in text that stays inside one
GSM-7 segment where possible. Every message's fate (sent, delivered, failed, skipped) is
recorded. The whole flow still runs end to end with **no credentials** on the `log`
driver, so the demo and CI are unaffected.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Provider | **Pindo** | Kigali company, $0.01/SMS (Twilio is ~$0.33), Irembo as a customer, and the driver already speaks its API. See the research report |
| Phone verification | **Own 6-digit code sent through `sms.send()`**, not Pindo Verify | Works on the `log` driver, so it can be demonstrated and tested with no account. Mirrors the email flow. Pindo Verify costs the same $0.01, ties us to Pindo, and can't run offline |
| Numbers accepted | **Rwandan mobile only**: `+250 7[2389]X XXX XXX` (MTN 078/079, Airtel 072/073) | Pindo returns `409` for unsupported countries or networks. Reject at input, not after billing |
| Which notices go by SMS | **`critical` and `outcome` only.** `activity` becomes in-app only | Stops billed chatter. The README already names this as the next filter |
| Text encoding | **Normalise to GSM-7 before sending**, and log segment count | Keeps Kinyarwanda and English at 160 characters a segment |
| Delivery reports | **Webhook at `/api/webhooks/sms/pindo`**, guarded by a shared secret | Pindo posts `DELIVRD` / `UNDELIV` etc. per message; without it "sent" is all we know |
| Opt-out | **The Settings radio**, not "reply STOP" | A2P SMS in Rwanda is one-way; nobody can reply |
| Localised SMS text | **Out of scope**, as it was for email | The server has no i18n catalogue; all call sites write English. Follow-up |
| Quiet hours | **Out of scope** | No legal requirement; would need a send queue. Follow-up |

---

## Pindo, as verified against docs.pindo.ai (10 Oct 2026)

| Item | Detail |
|---|---|
| Auth | `Authorization: Bearer <token>`. The token is in the dashboard under Security; refreshing it revokes the old one |
| Send one | `POST https://api.pindo.io/v1/sms/` with `{ to, text, sender }`, all required. `to` in international form |
| Success | `201` with `{ status: "sent", sms_id, item_price, remaining_balance, total_cost }` |
| Errors | `401` bad token · `404` bad path · `409` unsupported country, unsupported network, or wrong number format |
| Delivery report | Configured in the dashboard under **SMS → Configurations**. Pindo posts `{ sms_id, status, modified_at, retries_count }` |
| Report statuses | `ACCEPTED`, `DELIVRD`, `UNDELIV`, `REJECTED`, `EXPIRED`, `UNKNOWN` |
| Report retries | **None documented**: "if it's down when an event occurs, that notification is missed" |
| Verify | `POST /v1/sms/verify` then `/v1/sms/verify/check`; $0.01 per PIN. Not used (see decisions) |
| No Node SDK | Plain `fetch`, which the driver already uses |

**Still to confirm by email with Pindo** (Phase 0): whether a new account can send from a
shared/default sender before "Isoko" is approved, the Airtel price, how Unicode is billed,
whether the DLR webhook can carry a custom header, and the minimum top-up and payment
methods (MoMo?).

---

## Phase 0 — Accounts and paperwork (no code; start first, it's the long pole)

1. **Open a Pindo account**, copy the API token, and top up the minimum. Keep the token
   out of git (`server/.env` only).
2. **Email Pindo** the five questions above. The answer on the shared sender decides
   whether a live demo is possible before the sender ID is approved.
3. **Start the "Isoko" sender ID** through a registered sponsor (the university or an
   incubator), since both steps need an RDB company certificate:
   - RURA "Sender ID Whitelisting Authorization": free, about 5 days.
   - MTN and Airtel registration, filed through Pindo with stamped letters on the
     sponsor's letterhead: about 3 weeks.
   "Isoko" already fits the rules (≤ 11 characters, starts with a letter, not generic).
4. **Fix the README and the `sms.ts` header comment** to describe the two separate approvals
   correctly. Today they say "RURA approval taking about three weeks".

**Done when:** a token is in `server/.env`, the sender ID application is filed, and
Pindo's answers are written into this section.

---

## Phase 1 — Make the driver safe to point at a real gateway

All in `server/src/lib/channels/`. No behaviour change on the `log` driver.

### 1a. `gsm7.ts` (new)

```ts
/** Replaces characters that would force UCS-2 with GSM-7 equivalents. */
export const toGsm7 = (text: string): string
/** True when every character is in the GSM-7 basic set or its extension table. */
export const isGsm7 = (text: string): boolean
/** Segments this text bills as: 160/153 for GSM-7, 70/67 for UCS-2. */
export const segmentCount = (text: string): number
```

`toGsm7` maps `’ ‘ ‛` → `'`, `“ ” „` → `"`, `– —` → `-`, `…` → `...`, non-breaking space →
space, and drops emoji and zero-width characters. It leaves anything else alone; if
something non-GSM survives, `segmentCount` reports the UCS-2 cost rather than hiding it.
Extension-table characters (`€ [ ] { } \ ~ ^ |`) count as two.

### 1b. `sms.ts` changes

- **Validate numbers.** Replace `normaliseMsisdn` with:
  ```ts
  /** Returns +2507XXXXXXXX, or null when the number is not a Rwandan mobile. */
  export const toRwandanMsisdn = (phone: string | null | undefined): string | null
  ```
  It accepts `07XXXXXXXX`, `2507…`, `+2507…`, with spaces or dashes, and allows only the
  MTN and Airtel prefixes 072, 073, 078 and 079. `send()` throws `InvalidNumberError` on
  `null` before any network call. The old name stays exported as an alias until callers move.
- **Normalise text** with `toGsm7()` inside `send()`, so no caller can forget it.
- **Time out** with `AbortSignal.timeout(Number(process.env.SMS_TIMEOUT_MS) || 10_000)`.
- **Read the real response.** Parse `sms_id`, `item_price` and `remaining_balance`
  (verified field names), and return them in `SmsResult`:
  ```ts
  export interface SmsResult {
    provider: string;
    providerMessageId: string | null;
    segments: number;          // from segmentCount(), on every driver
    cost: number | null;       // item_price, USD; null on log
    balance: number | null;    // remaining_balance; null on log
  }
  ```
- **Classify Pindo errors.** `401` → `"Pindo token rejected"` (config problem). `409` →
  `"Number or network not supported"` (permanent; the user should fix their number).
  Anything else keeps the current message. The body is still trimmed to 200 characters.
- **Warn on low balance.** If `balance` falls below `SMS_LOW_BALANCE_USD` (default 2),
  `console.warn` once per process. Running out of credit is otherwise invisible until
  every SMS fails.
- **The `log` driver prints the segment count** next to the text, so the demo shows the
  encoding work.

**Tests** (`tests/unit/`):
- `gsm7.test.ts`: curly quotes, emoji, extension characters, 160 vs 161, a real Kinyarwanda
  template with `n’` going from 3 segments to 1.
- `smsDriver.test.ts`: `toRwandanMsisdn` accepts the four prefixes in each form and rejects
  landlines (`025…`), foreign numbers and junk. With `global.fetch` mocked, the Pindo
  driver sends the right headers and body, parses a `201`, maps `401` and `409`, and
  aborts on timeout.

---

## Phase 2 — Phone number entry and verification

Mirrors the email confirmation flow in `authController.ts` (TTL, resend cooldown, single
use), with a code in place of a link because a code can be typed on the phone that received it.

### 2a. Migration `20261010100000-add-phone-verification.js`

On `Users`:

| Column | Type | Purpose |
|---|---|---|
| `phoneVerifiedAt` | `DATE NULL` | Set when the code is confirmed |
| `phoneVerificationCodeHash` | `STRING NULL` | SHA-256 of the 6-digit code plus the user id; the code is never stored |
| `phoneVerificationExpiresAt` | `DATE NULL` | 10 minutes after sending; also used for the resend cooldown, as email does |
| `phoneVerificationAttempts` | `INTEGER NOT NULL DEFAULT 0` | Locks the code after 5 wrong guesses |

Backfill: any user who already has `preferredChannel = 'sms'` and a valid number gets
`phoneVerifiedAt = now()`, so the seeded `eric` keeps producing SMS delivery rows. Check
where `eric`'s phone is seeded during this phase; `TESTING.md` says it is set, but no
seeder writes a `phone` literal.

Update `models/User.ts` and the serialiser so the hash and attempts are **never** returned
by `/users/me`.

### 2b. Endpoints (`authRoutes.ts`, both behind `verifyToken`)

- `POST /api/auth/send-phone-code` with `{ phone }`:
  1. `toRwandanMsisdn(phone)`; `400` if `null`.
  2. If the number differs from the stored one, save it and clear `phoneVerifiedAt`.
  3. If already verified for this number: `200 { verified: true }`.
  4. Cooldown of 60 s since the last send: `429 { retryAfter }`.
  5. Generate the code with `crypto.randomInt(0, 1_000_000)`, padded to 6 digits. Store the
     hash and expiry, reset attempts.
  6. Send directly through `sms.send()`, **not** `notify()`: like the email link, this is
     the message that decides whether the channel can be used at all. Text:
     `Isoko code: 123456. Expires in 10 minutes. Do not share it.` (GSM-7, 1 segment).
  7. On send failure: `502` with the reason. On `InvalidNumberError`: `400`.
- `POST /api/auth/verify-phone` with `{ code }`:
  - Expired, missing or locked: `400`. Wrong: increment attempts, `400` with attempts left.
  - Right: set `phoneVerifiedAt`, clear hash, expiry and attempts.

The code is never in a response. On the `log` driver it appears in the server log, which
is how it is demonstrated without an account, the same way the email link is.

### 2c. Profile update rule (`userController.ts`)

`phone` comes **out** of `UPDATABLE_FIELDS`. It now changes only through
`send-phone-code`, so a number can't be swapped after verification without being
re-confirmed. `preferredChannel: 'sms'` is accepted only when `phoneVerifiedAt` is set
(`400` otherwise), matching what the UI enforces.

### 2d. `notify.ts`

`deliverSms` gains a step between "no phone number" and sending:
`if (!user.phoneVerifiedAt)` → `skipped`, `"phone not verified"`. Add `phoneVerifiedAt` to
the `attributes` list in the `User.findByPk` call.

**Tests** (`tests/integration/phoneVerification.test.ts`): send → code from the
`log`-driver spy → verify; wrong code ×5 locks; expired code; cooldown `429`; changing the
number clears verification; an invalid number gives `400` and sends nothing; `phone` in
`PUT /users/me` is ignored; `preferredChannel: 'sms'` is refused while unverified; and
`notifySms`, the SMS twin of `notifyEmail.test.ts`, covers sent / not opted in / no phone /
not verified / driver failure.

---

## Phase 3 — Delivery reports

### 3a. Migration `20261010100100-add-delivery-report-fields.js`

On `NotificationDeliveries`:

| Column | Type | Purpose |
|---|---|---|
| `deliveredAt` | `DATE NULL` | When the carrier confirmed |
| `providerStatus` | `STRING NULL` | Raw status: `DELIVRD`, `UNDELIV`, … |
| `segments` | `INTEGER NULL` | From `SmsResult` |
| `cost` | `DECIMAL(10,4) NULL` | `item_price`, USD |

Plus an index on `(provider, providerMessageId)`, for webhook lookups.

`DeliveryStatus` gains `'delivered'` in `types/domain.ts` and the model validator.
`deliverSms` records `segments` and `cost` on `sent`.

### 3b. Endpoint `POST /api/webhooks/sms/pindo`

In `webhookRoutes.ts`, next to the payment callback, with a new `smsWebhookController.ts`:

- **Auth:** `SMS_WEBHOOK_SECRET`, compared with the existing `secretMatches()` (move it to
  `lib/secrets.ts` so both controllers share it). Read it from the `X-Webhook-Secret`
  header if Pindo can set custom headers on the DLR webhook, otherwise from a `?secret=`
  query parameter. Which one depends on Pindo's answer in Phase 0. If the secret is unset,
  reject everything in production and accept in development, as the payment webhook does.
- **Mapping:** `DELIVRD` → `delivered` with `deliveredAt = modified_at`; `UNDELIV`,
  `REJECTED`, `EXPIRED` → `failed` with `error = "carrier: <status>"`; `ACCEPTED`,
  `UNKNOWN` → no status change, but `providerStatus` is still updated.
- **Unknown `sms_id`:** `200` and ignore. Pindo doesn't retry, so a non-2xx gains nothing.
- **Idempotent by nature:** setting the same status twice is harmless. A late `ACCEPTED`
  never overwrites `delivered` or `failed`.

**Known limit, documented rather than solved:** Pindo doesn't retry a missed report, so a
row can stay `sent` forever. The admin view (Phase 5) reports "sent, no report after 24 h"
as its own figure instead of treating it as delivered.

**Tests** (`tests/integration/smsWebhook.test.ts`): bad or missing secret `401`; each
status maps correctly; an unknown id returns `200` and changes nothing; `ACCEPTED` after
`DELIVRD` doesn't regress it.

---

## Phase 4 — Send only what is worth paying for

`policy.ts`:

```ts
const POLICY: Record<NotificationCategory, DeliveryChannel[]> = {
  activity: ['in_app'],
  outcome: ['in_app', 'sms', 'email'],
  critical: ['in_app', 'sms', 'email'],
};
```

Rewrite the header comment: `activity` no longer means "what every call site did before
email". Update `notificationPolicy.test.ts`.

Then **re-read the 18 `notify()` call sites** and confirm each category against one
question: *would a worker without the app open want to pay attention to this now?* Eight
are already annotated. The candidates most likely to move from `activity` to `outcome` are
the ones that ask the worker to act (being invited to a gig, a skill task needing
evidence). List every change in the commit message.

**Tighten the SMS text** in `deliverSms`: `${title}: ${body}` is often over 160
characters. Cut the body so the whole message fits in **one GSM-7 segment** (`segmentCount`
from Phase 1), ending in `…` → `...`, and add a short link `isoko: <APP_URL>/notifications`
only if it still fits. A test asserts that every annotated call site's message, filled in
with a realistic long gig title, comes to 1 segment.

---

## Phase 5 — Client

### 5a. `NotificationPreferences.tsx`

- **Enable the SMS radio.** Delete the "Not available yet." hint and the `disabled` rule.
- **Choosing SMS without a verified number** opens a phone step in place, instead of saving:
  1. Antd `Input` with `addonBefore="+250"`, `inputMode="tel"` and the placeholder
     `78X XXX XXX`. Client-side check against the same four prefixes.
  2. **Consent line under the field (Law 058/2021):** "Isoko will send notifications to
     this number through Pindo, an SMS provider in Rwanda. You can switch SMS off here at
     any time." Choosing SMS is the consent; nothing is pre-selected.
  3. "Send code" calls `authApi.sendPhoneCode`. Show the cooldown countdown from
     `retryAfter`.
  4. Antd `Input.OTP` (length 6) calls `authApi.verifyPhone`. On success, save
     `preferredChannel: 'sms'` and refresh the profile.
- **Verified state:** a success `Alert` showing the masked number (`+250 78• ••• 567`) and
  a "Change number" link back to step 1.
- Must work at 375 px: input and button stack on `xs`, as the other mobile fixes do.

### 5b. Plumbing

- `authApi.ts`: `sendPhoneCode(phone)`, `verifyPhone(code)`.
- `types/index.ts`: `phoneVerifiedAt?: string | null` on the profile.
- `userApi.ts`: remove `phone` from `UpdateProfilePayload`, since the server now ignores it.
- `en.json` + `rw.json`: about 15 keys under `settings.notifications.sms*`, written
  properly in Kinyarwanda and not machine-filled. `scripts/check-i18n-parity.mjs` must pass.

### 5c. Admin: SMS health card (small)

`GET /api/admin/sms-health` returns, for the last 7 days, counts of SMS deliveries by
status, "sent, no report after 24 h", total `cost`, average `segments`, and the last
`balance` seen (kept in memory by the driver; `null` after a restart until the next send).
Show it as one card on `AdminDashboard.tsx`. It's the evidence a pilot report needs: how
many were reached and what it cost.

---

## Phase 6 — Configuration, docs and demo

- **`server/.env.example`:**
  ```
  SMS_DRIVER=log              # log | pindo
  PINDO_API_TOKEN=
  SMS_SENDER_ID=Isoko         # must be approved by RURA + MTN + Airtel before use
  SMS_WEBHOOK_SECRET=
  SMS_TIMEOUT_MS=10000
  SMS_LOW_BALANCE_USD=2
  ```
- **README:** an SMS section shaped like the email one (drivers, what is needed to go
  live, the sender-ID timeline, the webhook URL to paste into Pindo's dashboard). Remove
  "Notification volume" from "Before going live", since Phase 4 resolves it.
- **TESTING.md:** a walkthrough. Log in as a worker, Settings → Notifications → SMS, enter
  `0788 123 456`, copy the code from the server log, confirm, then trigger an `outcome`
  notice and find the `[sms:log]` line with its segment count.
- **`docker-compose.yml`:** pass the new variables through to the server container.
- **Demo for assessors** (from the research report), in order of what's available:
  1. The `log` driver: the full flow, with no account needed. Always works.
  2. `SMS_DRIVER=pindo` to a team member's phone, if Pindo allows a shared sender before
     "Isoko" is approved. Record it in advance in case the network misbehaves on the day.
  3. The delivery report arriving: expose the local server with a tunnel
     (`cloudflared` / `ngrok`) and point Pindo's DLR webhook at it.

---

## Commit sequence

Each commit builds, lints and passes tests on its own, with no attribution trailers:

1. `Plan the Pindo SMS integration` (this file)
2. `Keep SMS text inside GSM-7` (`gsm7.ts` + tests)
3. `Accept only Rwandan mobile numbers for SMS` (validation + tests)
4. `Read Pindo's real response and stop waiting forever` (timeout, cost, balance, errors)
5. `Let people confirm their phone number` (migration, endpoints, tests)
6. `Only send SMS to confirmed numbers` (`notify.ts`, profile rule)
7. `Record whether SMS actually arrived` (migration, webhook, tests)
8. `Keep SMS for notices worth paying for` (policy + call-site review + one-segment text)
9. `Offer SMS in Settings` (client, both locales)
10. `Show SMS delivery and spend to admins`
11. `Document the SMS channel and how to take it live`
12. `Record the SMS plan as delivered` (refresh this file's status)

## Verification

- `cd server && npm run lint && npm run typecheck && npm test && npm run build`
- `cd client && npx eslint src && npx tsc --noEmit -p tsconfig.app.json && npm test && npm run build`
- `node scripts/check-i18n-parity.mjs`
- Manual, on the `log` driver: the TESTING.md walkthrough above, at desktop width and 375 px.
- Manual, on `pindo` (once Phase 0 allows): one real message to a team phone, its
  delivery row moving `sent` → `delivered` through the webhook, and the cost on the admin card.

## Risks

| Risk | Mitigation |
|---|---|
| Sender ID not approved before assessment | The `log` driver demo is complete on its own. Start Phase 0 now |
| Pindo can't send before "Isoko" is approved | Ask in Phase 0. Fallback is the `log` demo plus a recorded send once approved |
| Missed delivery reports (no retries) | Count "no report after 24 h" separately; never infer delivery |
| Pindo is a small team (no SDK, docs moved in 2025) | The driver seam stays. An Africa's Talking driver is about 40 lines if ever needed (research report) |
| Credit runs out silently | Low-balance warning plus the admin card's last balance |
| Code-sending endpoint abused to bill us | 60 s cooldown, Rwandan numbers only, authenticated users only. Add a per-user daily cap of 5 if abuse appears |

## Out of scope (follow-ups)

- Kinyarwanda SMS text: needs a server-side message catalogue, shared with email.
- Quiet hours (holding non-critical SMS from 20:00–08:00): needs a send queue.
- USSD for feature-phone workers: a costed next step (about RWF 26,000/month for a shared
  code), prototyped in a sandbox if at all.
- An Africa's Talking fallback driver.
- NCSA data-controller registration and cross-border transfer paperwork for a real launch.
  The consent line in Phase 5 covers the pilot.
