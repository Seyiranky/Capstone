import type { Transaction as DbTransaction } from 'sequelize';
import { Match, MatchMember, Payout, SafetyNetEntry, User, type Transaction } from '../models';
import { generateReceiptNumber } from './escrowRules';

export interface PayoutShare {
  userId: string;
  role: 'lead' | 'crew' | 'apprentice';
  amount: number;
}

/**
 * Splits a released amount between the lead and everyone who joined the job.
 *
 * Shares are rounded down to whole francs and the lead takes the remainder, so
 * the parts always add up to exactly what was released. Members who were
 * invited but never joined get nothing; their share stays with the lead.
 */
export const splitShares = (
  total: number,
  leadId: string,
  members: { userId: string; role: 'crew' | 'apprentice'; sharePercent: number }[],
): PayoutShare[] => {
  const parts = members
    .filter((m) => m.sharePercent > 0)
    .map((m) => ({ userId: m.userId, role: m.role, amount: Math.floor((total * m.sharePercent) / 100) }));
  const toMembers = parts.reduce((sum, p) => sum + p.amount, 0);
  return [{ userId: leadId, role: 'lead' as const, amount: total - toMembers }, ...parts];
};

/**
 * Records who got what from a released transaction, one receipt each.
 *
 * Runs inside the caller's database transaction so a release and its payouts
 * land together or not at all. The lead's payout carries the transaction's own
 * receipt number, so links already shown for the job keep working.
 */
export const createFor = async (tx: Transaction, t: DbTransaction): Promise<Payout[]> => {
  const match = await Match.findByPk(tx.matchId, { transaction: t });
  if (!match) return [];
  const joined = await MatchMember.findAll({ where: { matchId: match.id, status: 'joined' }, transaction: t });
  const total = Number(tx.releasedAmount ?? tx.amount);
  const releasedAt = tx.releasedAt ?? new Date();
  const shares = splitShares(total, match.workerId, joined);
  const payouts = await Payout.bulkCreate(
    shares.map((share) => ({
      transactionId: tx.id,
      matchId: match.id,
      userId: share.userId,
      role: share.role,
      amount: share.amount,
      currency: tx.currency,
      receiptNumber: share.role === 'lead' && tx.receiptNumber ? tx.receiptNumber : generateReceiptNumber(),
      releasedAt,
    })),
    { transaction: t },
  );
  await recordSafetyNet(tx, payouts, total, t);
  return payouts;
};

/**
 * The safety-net side of a release, in the same database transaction.
 *
 * A client's contribution is shared between everyone paid, in proportion to
 * their payout (and scaled down if a split dispute released only part of the
 * job). Anyone who chose to save toward Ejo Heza has that share of their payout
 * set aside.
 */
const recordSafetyNet = async (
  tx: Transaction,
  payouts: Payout[],
  total: number,
  t: DbTransaction,
): Promise<void> => {
  const entries: { userId: string; payoutId: string; kind: 'contribution' | 'ejoHeza'; amount: number; note: string | null }[] = [];
  const contribution = Number(tx.safetyNetContribution ?? 0) * (total / Number(tx.amount));
  if (contribution > 0 && total > 0) {
    for (const p of payouts) {
      const share = Math.floor((contribution * Number(p.amount)) / total);
      if (share > 0) entries.push({ userId: p.userId, payoutId: p.id, kind: 'contribution', amount: share, note: null });
    }
  }
  const savers = await User.findAll({
    where: { id: payouts.map((p) => p.userId) },
    attributes: ['id', 'savingsPercent'],
    transaction: t,
  });
  const percentOf = new Map(savers.map((u) => [u.id, u.savingsPercent]));
  for (const p of payouts) {
    const pct = percentOf.get(p.userId) ?? 0;
    const saved = Math.floor((Number(p.amount) * pct) / 100);
    if (saved > 0) entries.push({ userId: p.userId, payoutId: p.id, kind: 'ejoHeza', amount: saved, note: `${pct}% of payout` });
  }
  if (entries.length) await SafetyNetEntry.bulkCreate(entries, { transaction: t });
};
