import type { Transaction as DbTransaction } from 'sequelize';
import { Match, MatchMember, Payout, type Transaction } from '../models';
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
  return Payout.bulkCreate(
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
};
