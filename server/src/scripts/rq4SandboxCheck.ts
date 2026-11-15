/**
 * RQ4 evidence: does a Mobile Money payment leave a complete, verifiable work record?
 *
 *   npm run rq4:check            # 30 jobs (the report's test)
 *   npm run rq4:check -- 5       # a quicker run
 *
 * For each job it goes through the platform's own payment code, against MTN's
 * real MoMo sandbox:
 *   1. a finished job is paid with requestForMatch, as the client's "Pay" does;
 *   2. the payment is followed with refreshStatus until MTN settles it;
 *   3. the stored record is checked for its required fields, and that the job
 *      has exactly one transaction;
 *   4. MTN's callback is replayed three times, which must change nothing;
 *   5. MTN is asked directly about the stored reference, and its status,
 *      amount and external id must agree with the record.
 * Then five requests use the number MTN reserves for failure and five the
 * number it keeps pending, straight through the adapter (the app accepts only
 * Rwandan numbers, so these cannot go through requestForMatch).
 *
 * Runs against the local development database with fixture accounts that it
 * removes afterwards; email and SMS go to the log driver, so nothing is sent.
 * Needs the MTN sandbox keys in server/.env. Writes a JSON summary to
 * docs/evidence/rq4/. Not run in CI: it needs credentials and the network.
 */
import './rq4Env';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import db from '../models';
import * as paymentService from '../services/paymentService';
import adapter from '../services/payments/mtnMomoAdapter';

const REQUIRED_FIELDS = [
  'id', 'matchId', 'amount', 'currency', 'status', 'provider', 'reference',
  'providerReference', 'providerStatus', 'payerMsisdn', 'callbackReceivedAt', 'receiptNumber',
] as const;
const FAIL_NUMBER = '46733123460';
const PENDING_NUMBER = '46733123453';
const PAYER = '0788123456';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const main = async () => {
  const jobs = Number(process.argv[2] ?? 30);
  const run = `rq4-${Date.now()}`;
  const passwordHash = await bcrypt.hash(`${run}-unused`, 10);
  const skill = await db.Skill.findOne({ where: { parentId: null } });
  if (!skill) throw new Error('No skills seeded in the development database; run npm run seed first.');
  const client = await db.User.create({ name: 'RQ4 Client', email: `${run}-client@example.invalid`, passwordHash, role: 'client' });
  const worker = await db.User.create({ name: 'RQ4 Worker', email: `${run}-worker@example.invalid`, passwordHash, role: 'worker' });

  const payments: Record<string, unknown>[] = [];
  try {
    for (let i = 1; i <= jobs; i += 1) {
      const gig = await db.Gig.create({
        clientId: client.id, skillId: skill.id, title: `RQ4 job ${i}`, description: 'RQ4 sandbox check',
        budget: 1000 + i * 10, locationLat: -1.95, locationLng: 30.06, status: 'matched',
      });
      const match = await db.Match.create({ gigId: gig.id, workerId: worker.id, status: 'completed', acceptedAt: new Date(), completedAt: new Date() });

      // A request MTN never received (network error) is retried, as a client pressing
      // Pay again would; every retry is recorded in the evidence.
      const started = Date.now();
      let requestRetries = 0;
      let tx: Awaited<ReturnType<typeof paymentService.requestForMatch>> | null = null;
      while (!tx) {
        try {
          tx = await paymentService.requestForMatch(match.id, client.id, { payerMsisdn: PAYER });
        } catch (err) {
          if (requestRetries >= 3) throw err;
          requestRetries += 1;
          console.log(`job ${i}: request did not reach MTN (${(err as Error).message}); retry ${requestRetries}`);
          await sleep(3000);
        }
      }
      for (let n = 0; n < 30 && tx.status === 'initiated'; n += 1) {
        await sleep(1000);
        tx = await paymentService.refreshStatus(tx);
      }
      const seconds = (Date.now() - started) / 1000;
      await tx.reload();

      const missing = REQUIRED_FIELDS.filter((f) => tx[f] === null || tx[f] === undefined || tx[f] === '');
      const rowsForJob = await db.Transaction.count({ where: { matchId: match.id } });

      // Replay MTN's callback three times; the row and its payouts must not change.
      const before = { updatedAt: tx.updatedAt.getTime(), payouts: await db.Payout.count({ where: { transactionId: tx.id } }) };
      let replayChanges = 0;
      for (let r = 0; r < 3; r += 1) {
        const result = await paymentService.applyCallback({
          provider: tx.provider, providerReference: tx.providerReference as string, status: 'SUCCESSFUL', failureReason: null, raw: {},
        });
        await tx.reload();
        const payouts = await db.Payout.count({ where: { transactionId: tx.id } });
        if (!result.ok || !result.duplicate || tx.updatedAt.getTime() !== before.updatedAt || payouts !== before.payouts) {
          replayChanges += 1;
        }
      }

      // Ask MTN directly about the stored reference.
      const mtn = await adapter.checkStatus!(tx.providerReference as string);
      const raw = mtn.raw as { amount?: string; externalId?: string; financialTransactionId?: string };
      const agrees =
        adapter.normaliseStatus(mtn.status) === tx.status &&
        Number(raw.amount) === Math.round(Number(tx.amount)) &&
        raw.externalId === tx.reference;

      payments.push({
        job: i, status: tx.status, requestRetries, seconds: Number(seconds.toFixed(1)), missingFields: missing, rowsForJob,
        replayChanges, mtnStatus: mtn.status, mtnAgrees: agrees, mtnTransactionId: raw.financialTransactionId ?? null,
        reference: tx.reference, receiptNumber: tx.receiptNumber,
      });
      console.log(`job ${String(i).padStart(2)}  ${tx.status}  ${seconds.toFixed(1)} s  fields ${REQUIRED_FIELDS.length - missing.length}/${REQUIRED_FIELDS.length}  replays changed ${replayChanges}  MTN agrees ${agrees}`);
    }

    // Reserved sandbox numbers, through the adapter.
    const reserved = async (msisdn: string, expect: 'failed' | 'initiated') => {
      const out: Record<string, unknown>[] = [];
      for (let i = 0; i < 5; i += 1) {
        const { providerReference } = await adapter.requestPayment({ amount: 100, payerMsisdn: msisdn, reference: `${run}-${expect}-${i}`, note: 'RQ4 reserved number' });
        let status = 'PENDING';
        let reason: string | null = null;
        for (let n = 0; n < 6; n += 1) {
          await sleep(1500);
          ({ status, failureReason: reason } = await adapter.checkStatus!(providerReference));
          if (adapter.normaliseStatus(status) !== 'initiated') break;
        }
        out.push({ status, reason, asExpected: adapter.normaliseStatus(status) === expect && (expect !== 'failed' || Boolean(reason)) });
      }
      return out;
    };
    const failed = await reserved(FAIL_NUMBER, 'failed');
    const pending = await reserved(PENDING_NUMBER, 'initiated');

    const ok = (p: Record<string, unknown>[], f: (x: Record<string, unknown>) => boolean) => p.filter(f).length;
    const confirmedTimes = payments.filter((p) => p.status === 'confirmed').map((p) => p.seconds as number);
    const summary = {
      date: new Date().toISOString(),
      environment: 'MTN MoMo sandbox (test money), local development database',
      jobs,
      confirmed: ok(payments, (p) => p.status === 'confirmed'),
      requestRetries: payments.reduce((n, p) => n + (p.requestRetries as number), 0),
      secondsToConfirm: confirmedTimes.length
        ? { median: median(confirmedTimes), min: Math.min(...confirmedTimes), max: Math.max(...confirmedTimes) }
        : null,
      recordsWithAllFields: ok(payments, (p) => (p.missingFields as string[]).length === 0),
      requiredFields: REQUIRED_FIELDS,
      oneTransactionPerJob: ok(payments, (p) => p.rowsForJob === 1),
      duplicateCallbacksWithEffect: payments.reduce((n, p) => n + (p.replayChanges as number), 0),
      duplicateCallbacksSent: jobs * 3,
      agreeingWithMtn: ok(payments, (p) => p.mtnAgrees === true),
      reservedFailureNumber: { asExpected: ok(failed, (x) => x.asExpected === true), of: failed.length, results: failed },
      reservedPendingNumber: { asExpected: ok(pending, (x) => x.asExpected === true), of: pending.length, results: pending },
      payments,
    };

    const dir = path.resolve(__dirname, '../../../docs/evidence/rq4');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `run-${summary.date.slice(0, 10)}.json`);
    fs.writeFileSync(file, `${JSON.stringify(summary, null, 2)}\n`);

    console.log(`
requests retried after a network error ${summary.requestRetries}
payments confirmed by MTN              ${summary.confirmed} of ${jobs}${summary.secondsToConfirm ? `  (median ${summary.secondsToConfirm.median} s, range ${summary.secondsToConfirm.min}-${summary.secondsToConfirm.max} s)` : ''}
records with all ${REQUIRED_FIELDS.length} required fields      ${summary.recordsWithAllFields} of ${jobs}
one transaction row per job            ${summary.oneTransactionPerJob} of ${jobs}
duplicate callbacks with any effect    ${summary.duplicateCallbacksWithEffect} of ${summary.duplicateCallbacksSent}
MTN agrees on status/amount/reference  ${summary.agreeingWithMtn} of ${jobs}
reserved failure number -> failed      ${summary.reservedFailureNumber.asExpected} of 5
reserved pending number -> still open  ${summary.reservedPendingNumber.asExpected} of 5
written to ${path.relative(process.cwd(), file)}`);
  } finally {
    // Remove every fixture row: payouts, transactions, notifications, jobs, accounts.
    const gigs = await db.Gig.findAll({ where: { clientId: client.id }, attributes: ['id'] });
    const matches = await db.Match.findAll({ where: { gigId: gigs.map((g) => g.id) }, attributes: ['id'] });
    const txs = await db.Transaction.findAll({ where: { matchId: matches.map((m) => m.id) }, attributes: ['id'] });
    await db.Payout.destroy({ where: { transactionId: txs.map((t) => t.id) } });
    await db.Transaction.destroy({ where: { id: txs.map((t) => t.id) } });
    await db.Notification.destroy({ where: { userId: [client.id, worker.id] } });
    await db.Match.destroy({ where: { id: matches.map((m) => m.id) } });
    await db.Gig.destroy({ where: { id: gigs.map((g) => g.id) } });
    await db.User.destroy({ where: { id: [client.id, worker.id] } });
    await db.sequelize.close();
  }
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
