# MTN MoMo sandbox: live run (20 Oct 2026)

Evidence for FR-10, NFR-4, NFR-8 and RQ4. Run against MTN's real sandbox
(`sandbox.momodeveloper.mtn.com`, `X-Target-Environment: sandbox`) with a Collections
subscription created on momodeveloper.mtn.com. No real money moves in the sandbox.

## 1. Adapter smoke test (`npm run momo:smoke`)

```
Requesting 100 from sandbox payer 250788123456 (reference ISK-SMOKE-2cd4bb4e)...
MTN accepted it. MTN reference: 58e71d26-c64b-4bb2-8ef4-9743c1418d92
  2.5s  MTN: SUCCESSFUL  Isoko: confirmed
Sandbox payment confirmed. MTN transaction id: 656639075
```

Failure path, with a number the sandbox reserves to fail (`npm run momo:smoke -- 46733123460`):

```
  3.7s  MTN: FAILED  Isoko: failed  (INVALID_CURRENCY)
Sandbox payment failed: INVALID_CURRENCY.
```

Found on the way: the sandbox accepts only EUR (RWF is refused with `INVALID_CURRENCY`), and
`46733123460`, which older guides give as a number that succeeds, now fails. Ordinary numbers,
including Rwandan `2507…` ones, succeed.

## 2. In the app, as a client

A throwaway client paid a throwaway worker 1,500 RWF for a finished job:

| Screenshot | What it shows |
|---|---|
| `app-pay-panel.png` | Pay with MTN Mobile Money: the MoMo number and total |
| `app-approve.png` | The request is with MTN; the client approves on their phone |
| `app-paid.png` | Confirmed by status polling; the worker is paid and a receipt issued |
| `app-receipt.png` | The public receipt, with MTN's own transaction id |

The transaction as stored:

| Field | Value |
|---|---|
| provider | `mtn-momo` |
| status | `confirmed` (MTN `SUCCESSFUL`) |
| amount | 1500.00 RWF (sent to the sandbox as EUR, the only currency it accepts) |
| payer | +250788123456 |
| providerReference (MTN X-Reference-Id) | `cb3154d4-aea7-4056-bb1f-1283ce1ae156` |
| MTN financialTransactionId | `1141306052` |
| payouts / receipt | 1 / `ISK-Y8P6-EV08` |

The throwaway accounts and their records were deleted afterwards.
