# RQ4: does a Mobile Money payment leave a complete, verifiable record?

Evidence for Section 4.3 of the technical report (Table 4.2, Figure 4.18).

## The script

[`server/src/scripts/rq4SandboxCheck.ts`](../../../server/src/scripts/rq4SandboxCheck.ts), run with
`cd server && npm run rq4:check` (or `npm run rq4:check -- 5` for a quick check). It needs the MTN
MoMo sandbox keys in `server/.env` and a local development database. For each job it uses the
platform's own payment code against MTN's real sandbox (test money):

1. pays a finished job with `requestForMatch`, as the client's **Pay** button does;
2. follows the payment with `refreshStatus` until MTN settles it;
3. checks the stored record has its 12 required fields, and that the job has exactly one transaction;
4. replays MTN's callback three times, which must change nothing (row and payouts unchanged);
5. asks MTN directly about the stored reference: status, amount and external id must agree.

Then five requests use the number MTN reserves for failure, and five the number it keeps pending,
directly through the adapter (the app only accepts Rwandan numbers). Fixture accounts and jobs are
removed afterwards, and email and SMS go to the log driver, so nothing is sent to anyone.

## Runs

| Measure | 5 Nov 2026 (in the report) | 15 Nov 2026 re-run ([run-2026-11-15.json](run-2026-11-15.json)) |
|---|---|---|
| Payments confirmed by MTN | 30 of 30 (median 2.1 s, range 2.0–3.4 s) | 30 of 30 (median 1.7 s, range 1.7–4.3 s) |
| Records with all 12 required fields | 30 of 30 | 30 of 30 |
| One transaction row per job | 30 of 30 | 30 of 30 |
| Duplicate callbacks that changed anything | 0 of 90 | 0 of 90 |
| Status, amount and reference agreeing with MTN's API | 30 of 30 | 30 of 30 |
| Reserved failure number reported as failed, with MTN's reason | 5 of 5 | 5 of 5 |
| Reserved pending number still open | 5 of 5 | 5 of 5 |

The 5 November run used earlier, unsaved scripts (`rq4.mjs`, `rq4check.ts` in Figure 4.18) that
drove the same steps through the API; they were not kept, so the check was rebuilt as the script
above and re-run on 15 November with the same results. Confirmation times differ between runs
because they depend on MTN's sandbox and the network.

## What this does and does not show

It shows that each sandbox payment leaves a complete, job-linked record that MTN's own API
confirms, and that repeated callbacks cannot create a second payment. Sandbox payments move no
real money, so it says nothing about whether real clients would pay this way.
