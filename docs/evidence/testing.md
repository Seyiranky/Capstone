# Testing evidence 

Isoko is tested at four levels. Every push runs the first three in CI (GitHub Actions); failures
are posted as annotations on the run.

| Approach | Tool | What it covers | Size | Result |
|---|---|---|---|---|
| **Unit** | Jest (server), Vitest (client) | Pure logic with no database: match scoring and haversine distance, trust score, reviewer draw and collusion rules, rate guidance, PDF writer, storage keys, email and SMS drivers; on the client, job stages and next actions, offline queue | 155 server + 23 client | all pass |
| **Integration** | Jest + Supertest, real PostgreSQL | Every API route through Express, middleware and the database: auth, roles, eligibility, the job flow, payments (MTN mocked), disputes, support, account deletion, uploads, security rules | 441 server tests in 45 files | all 596 server tests pass; one test has been intermittent, see below |
| **End-to-end** | Playwright | The production web build against the real API and a fresh database of demo data, in real browser engines | 16 tests x 5 browser setups | 64 of 64 run here pass (Firefox: see below) |
| **Performance** | `client/perf/` scripts | API response times (NFR-2) and page load on a desktop and a throttled low-end phone | see `perf/README.md` | first paint on a low-end phone 6.6 s to 3.5 s |

## End-to-end tests (`client/e2e/`)

Run with `cd client && npm run e2e` (all browsers) or `npm run e2e:chromium`. Playwright starts
the API on port 4100 against `isoko_talents_e2e`, emptied, migrated and seeded on every run (the
script refuses any database not ending in `_e2e`), and a production build on port 4174.
Payments are simulated and SMS and email are logged: nothing leaves the machine. Each test creates
its own data through the API, so runs and browsers never collide.

| Test | What it proves |
|---|---|
| Wrong password | Refused with one message; the visitor stays on sign-in |
| Empty sign-in form | Not sent; required fields are marked |
| Private page while signed out | Redirected to sign-in |
| Client, worker, admin sign in | Each lands on their own dashboard and navigation |
| Language choice | Kinyarwanda is kept after a reload |
| **The job journey** | As two people at once: a worker applies, the client approves them, the worker confirms and says the work is finished, the client marks it done and pays with Mobile Money, and a public receipt is issued |
| Sensitive gig | A worker who lacks a requirement sees each missing item with a link to fix it, and no Apply button |
| Empty gig form | Required fields are marked |
| Six pages at the device's width | Nothing scrolls sideways (sign-in, privacy, dashboard, marketplace, your matches, help centre) |

### Compatibility (browser engines and devices)

| Setup | Engine | Screen | Result |
|---|---|---|---|
| Desktop Chrome | Chromium 141 | 1280 x 720 | 16 / 16 |
| Desktop Safari | WebKit 26 | 1280 x 720 | 16 / 16 |
| Android phone (Pixel 7) | Chromium, touch, mobile user agent | 412 x 839 | 16 / 16 |
| iPhone 14 | WebKit, touch, mobile user agent | 390 x 664 | 16 / 16 |
| Desktop Firefox | Gecko 142 | 1280 x 720 | not run here: macOS refused to start the downloaded Firefox from the tool's process. Run `npx playwright test --project=firefox` from your own terminal |

Phones are emulated (screen size, touch, user agent, device pixel ratio) in the real engines; the
page-load measurements add CPU and network throttling for a low-end phone (`perf/README.md`).

### What the end-to-end tests found, and what changed

| Found | Fix |
|---|---|
| A wrong password showed the same error **twice**: the form and the Google button below it both displayed the shared sign-in error | The Google button no longer repeats it (`GoogleLoginButton.tsx`) |
| On an iPhone-width screen a worker's four Marketplace tabs were 22 px wider than the screen; "Your matches" was cut off and the page scrolled sideways | The tab row scrolls by itself (`MarketplacePage.tsx`, `.isoko-tabs-scroll`) |
| A tap on a dialog's button during its opening animation was lost on mobile WebKit | Tests wait for dialogs to finish opening (a test-timing fix, not an app change) |

## Known intermittent test

`api.test.ts` "registers a client and a worker" failed twice in about 20 runs and passed on every
re-run; it was never caught with its error message. CI now reports a failing test's name and
message as an annotation, so the next occurrence will say why.

## Manual check on real devices (to do by the owner)

| Device | Browser | Sign in | Marketplace | Pay (sandbox) | Notes |
|---|---|---|---|---|---|
| Mac | Safari | | | | |
| Mac | Chrome | | | | |
| Android phone | Chrome | | | | |
| iPhone (if available) | Safari | | | | |
