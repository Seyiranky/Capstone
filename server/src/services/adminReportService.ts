import { Op } from 'sequelize';
import { Dispute, Gig, GigApplication, Match, NotificationDelivery, Payout, Skill, Transaction, User, sequelize } from '../models';
import * as sms from '../lib/channels/sms';

/**
 * What admins read about the platform as a whole: Mobile Money payments, SMS
 * reach and cost, and why applications are turned down.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether SMS is reaching people, and what it costs, over the last seven days.
 *
 * The figure a pilot report needs is reach, not attempts, so "sent" is split
 * by what the carrier said afterwards. Pindo does not retry a missed delivery
 * report, so a message still `sent` a day later is counted on its own rather
 * than assumed delivered.
 */
export const smsHealth = async () => {
  const since = new Date(Date.now() - 7 * DAY_MS);
  const where = { channel: 'sms' as const, createdAt: { [Op.gte]: since } };

  const [byStatus, totals, noReport, usersOnSms] = await Promise.all([
    NotificationDelivery.findAll({
      where,
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['status'],
      raw: true,
    }) as unknown as Promise<{ status: string; count: string }[]>,
    NotificationDelivery.findOne({
      where,
      attributes: [
        [sequelize.fn('SUM', sequelize.col('cost')), 'cost'],
        [sequelize.fn('AVG', sequelize.col('segments')), 'segments'],
      ],
      raw: true,
    }) as unknown as Promise<{ cost: string | null; segments: string | null } | null>,
    NotificationDelivery.count({
      where: { ...where, status: 'sent', sentAt: { [Op.lt]: new Date(Date.now() - DAY_MS) } },
    }),
    User.count({ where: { preferredChannel: 'sms', phoneVerifiedAt: { [Op.ne]: null } } }),
  ]);

  const counts: Record<string, number> = { sent: 0, delivered: 0, failed: 0, skipped: 0 };
  for (const row of byStatus) counts[row.status] = Number(row.count);

  const balance = sms.lastKnownBalance();
  return {
    since,
    driver: sms.driverName(),
    sender: process.env.SMS_SENDER_ID || 'Isoko',
    usersOnSms,
    counts,
    noReportAfter24h: noReport,
    cost: totals?.cost === null || totals?.cost === undefined ? 0 : Number(totals.cost),
    averageSegments: totals?.segments ? Number(Number(totals.segments).toFixed(2)) : null,
    balance: balance ? { amount: balance.amount, at: balance.at } : null,
  };
};

/**
 * Why applications are turned down, by skill.
 *
 * "Skill level" counts concentrated in one skill point at where training or
 * verification is needed; "distance" counts at where workers are missing.
 * Applications closed because someone else was chosen are reported apart, as
 * they say nothing about the applicant.
 */
export const rejectionReasons = async () => {
  const rows = (await GigApplication.findAll({
    where: { status: 'rejected', rejectionReason: { [Op.ne]: null } },
    attributes: ['rejectionReason'],
    include: [{ model: Gig, as: 'gig', attributes: ['skillId'], include: [{ model: Skill, as: 'skill', attributes: ['name'] }] }],
  })) as (GigApplication & { gig?: Gig & { skill?: Skill | null } })[];

  const bySkill = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const skill = row.gig?.skill?.name ?? 'Other';
    const counts = bySkill.get(skill) ?? {};
    counts[row.rejectionReason as string] = (counts[row.rejectionReason as string] ?? 0) + 1;
    bySkill.set(skill, counts);
  }
  return [...bySkill.entries()]
    .map(([skill, counts]) => ({ skill, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => (b.counts.skillLevel ?? 0) - (a.counts.skillLevel ?? 0) || b.total - a.total);
};

type PaymentState = 'paid' | 'pending' | 'failed';

const stateOf = (tx: Transaction): PaymentState =>
  tx.status === 'failed' || tx.escrowStatus === 'refunded' ? 'failed' : tx.status === 'initiated' ? 'pending' : 'paid';

/** Whether every worker's share of a payment reached their MoMo number. */
const transferOf = (payouts: Payout[] | undefined) => {
  if (!payouts?.length) return null;
  if (payouts.every((p) => p.transferStatus === 'sent')) return 'sent';
  if (payouts.some((p) => p.transferStatus === 'failed')) return 'failed';
  if (payouts.some((p) => p.transferStatus === 'no_number')) return 'no_number';
  return 'not_sent';
};

const mask = (msisdn: string | null) => (msisdn ? `${msisdn.slice(0, 6)}••••${msisdn.slice(-2)}` : null);

/**
 * Mobile Money payments.
 *
 * Paid jobs, payments waiting on the client to approve on their phone, finished
 * jobs not yet paid, failed attempts, and whether each worker's share reached
 * their MoMo number. Amounts are totals of the transactions in each state; the
 * payer's number is shown masked.
 */
export const payments = async () => {
  const transactions = (await Transaction.findAll({
    include: [
      {
        model: Match,
        as: 'match',
        attributes: ['id', 'workerId', 'status', 'completedVia', 'completedAt'],
        include: [
          { model: Gig, as: 'gig', attributes: ['id', 'title'], include: [{ model: User, as: 'client', attributes: ['id', 'name'] }] },
          { model: User, as: 'worker', attributes: ['id', 'name'] },
        ],
      },
      { model: Payout, as: 'payouts', attributes: ['id', 'transferStatus'] },
    ],
    order: [['updatedAt', 'DESC']],
  })) as (Transaction & { match?: Match & { gig?: Gig & { client?: User }; worker?: User }; payouts?: Payout[] })[];

  const totals: Record<PaymentState | 'awaiting', { count: number; amount: number }> = {
    paid: { count: 0, amount: 0 },
    pending: { count: 0, amount: 0 },
    failed: { count: 0, amount: 0 },
    awaiting: { count: 0, amount: 0 },
  };
  for (const tx of transactions) {
    const t = totals[stateOf(tx)];
    t.count += 1;
    t.amount += Number(tx.releasedAmount ?? tx.amount);
  }

  // Finished jobs the client has not paid yet (no payment, or only a failed one).
  const settled = new Set(transactions.filter((tx) => tx.status !== 'failed').map((tx) => tx.matchId));
  const done = (await Match.findAll({
    where: { status: 'completed' },
    attributes: ['id', 'agreedAmount', 'completedAt', 'updatedAt'],
    include: [
      { model: Gig, as: 'gig', attributes: ['id', 'title', 'budget'], include: [{ model: User, as: 'client', attributes: ['id', 'name'] }] },
      { model: User, as: 'worker', attributes: ['id', 'name'] },
    ],
  })) as (Match & { gig?: Gig & { client?: User }; worker?: User })[];
  const awaiting = done
    .filter((m) => !settled.has(m.id) && m.gig)
    .map((m) => ({
      matchId: m.id,
      amount: Number(m.agreedAmount ?? m.gig!.budget),
      since: m.completedAt ?? m.updatedAt,
      gig: { id: m.gig!.id, title: m.gig!.title },
      client: m.gig!.client ? { id: m.gig!.client.id, name: m.gig!.client.name } : null,
      worker: m.worker ? { id: m.worker.id, name: m.worker.name } : null,
    }))
    .sort((a, b) => new Date(a.since).getTime() - new Date(b.since).getTime());
  totals.awaiting = { count: awaiting.length, amount: awaiting.reduce((sum, a) => sum + a.amount, 0) };

  const transfers = { sent: 0, not_sent: 0, failed: 0, no_number: 0 } as Record<string, number>;
  for (const p of await Payout.findAll({ attributes: ['transferStatus'] })) transfers[p.transferStatus] = (transfers[p.transferStatus] ?? 0) + 1;

  const provider = process.env.PAYMENT_PROVIDER || 'simulated-momo';

  return {
    provider: {
      name: provider,
      environment: provider === 'mtn-momo' ? process.env.MOMO_TARGET_ENV || 'sandbox' : 'simulation',
    },
    totals,
    transfers,
    liveDisputes: await Dispute.count({ where: { status: ['open', 'escalated'] } }),
    awaiting: awaiting.slice(0, 20),
    recent: transactions.slice(0, 50).map((tx) => ({
      id: tx.id,
      state: stateOf(tx),
      amount: Number(tx.releasedAmount ?? tx.amount),
      extras: Number(tx.safetyNetContribution ?? 0) + Number(tx.coverPremium ?? 0),
      currency: tx.currency,
      provider: tx.provider,
      paidInAdvance: tx.escrowStatus === 'held',
      refunded: tx.escrowStatus === 'refunded',
      payer: mask(tx.payerMsisdn),
      failureReason: tx.failureReason,
      receiptNumber: tx.receiptNumber,
      transfer: transferOf(tx.payouts),
      updatedAt: tx.updatedAt,
      gig: tx.match?.gig ? { id: tx.match.gig.id, title: tx.match.gig.title } : null,
      client: tx.match?.gig?.client ? { id: tx.match.gig.client.id, name: tx.match.gig.client.name } : null,
      worker: tx.match?.worker ? { id: tx.match.worker.id, name: tx.match.worker.name } : null,
    })),
  };
};
