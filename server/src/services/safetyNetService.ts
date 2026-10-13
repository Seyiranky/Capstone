import { SafetyNetEntry, User, sequelize } from '../models';
import { HttpError } from '../lib/httpError';

/**
 * A worker's safety net: a pot their clients add to, which they can draw on
 * for sick days and emergencies, and what they have set aside toward Ejo Heza.
 *
 * The balance is never stored, only derived from the ledger, so it cannot
 * drift from its history.
 */

export const MAX_SAVINGS_PERCENT = 20;
/** Suggested and largest client contribution, as a share of the job's price. */
export const SUGGESTED_CONTRIBUTION = 0.03;
export const MAX_CONTRIBUTION = 0.2;

const totals = (entries: SafetyNetEntry[]) => {
  const sum = (kind: string) =>
    entries.filter((e) => e.kind === kind).reduce((s, e) => s + Number(e.amount), 0);
  const contributed = sum('contribution');
  const withdrawn = sum('withdrawal');
  return { contributed, withdrawn, balance: contributed - withdrawn, ejoHeza: sum('ejoHeza') };
};

export const summary = async (userId: string) => {
  const [user, entries] = await Promise.all([
    User.findByPk(userId, { attributes: ['savingsPercent'] }),
    SafetyNetEntry.findAll({ where: { userId }, order: [['createdAt', 'DESC']] }),
  ]);
  return {
    ...totals(entries),
    savingsPercent: user?.savingsPercent ?? 0,
    entries: entries.slice(0, 30),
  };
};

export const setSavingsPercent = async (userId: string, percent: unknown) => {
  const value = Number(percent);
  if (!Number.isInteger(value) || value < 0 || value > MAX_SAVINGS_PERCENT) {
    throw new HttpError(`Choose a whole percentage from 0 to ${MAX_SAVINGS_PERCENT}`, 400);
  }
  await User.update({ savingsPercent: value }, { where: { id: userId } });
  return summary(userId);
};

/**
 * Draws on the pot. The user's row is locked while the balance is checked and
 * the withdrawal written, so two requests at once cannot overdraw it.
 */
export const withdraw = async (userId: string, amount: unknown, note: unknown) => {
  const value = Math.floor(Number(amount));
  if (!Number.isFinite(value) || value < 100) throw new HttpError('Withdraw at least 100 RWF', 400);
  const reason = String(note ?? '').trim().slice(0, 280);
  await sequelize.transaction(async (t) => {
    await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
    const entries = await SafetyNetEntry.findAll({ where: { userId }, transaction: t });
    if (value > totals(entries).balance) throw new HttpError('That is more than your safety net holds', 409);
    await SafetyNetEntry.create(
      { userId, payoutId: null, kind: 'withdrawal', amount: value, note: reason || null },
      { transaction: t },
    );
  });
  return summary(userId);
};
