import crypto from 'crypto';
import { Op, type WhereOptions } from 'sequelize';
import jwt from 'jsonwebtoken';
import { User, Transaction, Match, Gig, Skill } from '../models';
import { passportSigningSecret } from '../config/env';

const monthKey = (date: Date) => date.toISOString().slice(0, 7);

export interface StatementEntry {
  date: Date;
  amount: number;
  currency: string;
  provider: string;
  reference: string;
  /** Checkable by anyone at /r/<number>, so a lender can verify a line on its own. */
  receipt: string | null;
  gig: string | null;
  category: string | null;
}

export interface MonthTotal {
  month: string;
  jobs: number;
  total: number;
}

export interface CategoryTotal {
  category: string;
  jobs: number;
  total: number;
}

export interface IncomeStatement {
  holder: { id: string; name: string; memberSince: Date };
  period: { from: string | Date | null; to: string | Date | null };
  currency: string;
  summary: {
    jobsPaid: number;
    totalEarned: number;
    averagePerMonth: number;
    averagePerJob: number;
    monthsActive: number;
  };
  byMonth: MonthTotal[];
  byCategory: CategoryTotal[];
  entries: StatementEntry[];
  generatedAt: string;
  signature: string;
}

/** A verification result, discriminated on `valid`. */
export type StatementVerification =
  | { valid: false; reason: 'invalidSignature' | 'unknownHolder' }
  | {
      valid: true;
      matches: boolean;
      holder: string;
      statedJobs: number;
      statedTotal: number;
      currentJobs: number;
      currentTotal: number;
    };

/** What gets signed into the statement token. */
interface StatementClaims extends jwt.JwtPayload {
  sub: string;
  digest: string;
  jobs: number;
  total: number;
}

/**
 * A verifiable record of earnings, for a lender rather than for the worker.
 *
 * The problem this addresses is that informal income is cash and undocumented,
 * so mobile-money micro-finance has no history to underwrite against. Only
 * released transactions count: an initiated payment is not income, and money
 * still held in escrow is not yet the worker's.
 */
export const build = async (
  userId: string,
  { from, to }: { from?: string | Date; to?: string | Date } = {},
): Promise<IncomeStatement | null> => {
  const user = await User.findByPk(userId);
  if (!user) return null;

  const where: WhereOptions & {
    status: string;
    escrowStatus: string;
    updatedAt?: Record<symbol, unknown>;
  } = {
    status: 'confirmed',
    escrowStatus: 'released',
  };
  if (from || to) {
    const range: Record<symbol, unknown> = {};
    if (from) range[Op.gte] = from;
    if (to) range[Op.lte] = to;
    where.updatedAt = range;
  }

  const transactions = await Transaction.findAll({
    where,
    include: [
      {
        model: Match,
        as: 'match',
        required: true,
        where: { workerId: userId },
        include: [{ model: Gig, as: 'gig', include: [{ model: Skill, as: 'skill' }] }],
      },
    ],
    order: [['updatedAt', 'ASC']],
  });

  const entries: StatementEntry[] = transactions.map((t) => ({
    date: t.updatedAt,
    amount: Number(t.amount),
    currency: 'RWF',
    provider: t.provider,
    reference: t.reference,
    receipt: t.receiptNumber,
    gig: t.match?.gig?.title ?? null,
    category: t.match?.gig?.skill?.category ?? null,
  }));

  const total = entries.reduce((sum, e) => sum + e.amount, 0);

  const byMonth = entries.reduce<Record<string, MonthTotal>>((map, e) => {
    const key = monthKey(new Date(e.date));
    if (!map[key]) map[key] = { month: key, jobs: 0, total: 0 };
    map[key].jobs += 1;
    map[key].total += e.amount;
    return map;
  }, {});

  const byCategory = entries.reduce<Record<string, CategoryTotal>>((map, e) => {
    const key = e.category ?? 'other';
    if (!map[key]) map[key] = { category: key, jobs: 0, total: 0 };
    map[key].jobs += 1;
    map[key].total += e.amount;
    return map;
  }, {});

  const months = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));

  const statement = {
    holder: { id: user.id, name: user.name, memberSince: user.createdAt },
    period: {
      from: from ? new Date(from).toISOString() : (entries[0]?.date ?? null),
      to: to ? new Date(to).toISOString() : (entries[entries.length - 1]?.date ?? null),
    },
    currency: 'RWF',
    summary: {
      jobsPaid: entries.length,
      totalEarned: total,
      // The figure a lender actually cares about: what a month typically looks
      // like, not a lifetime total.
      averagePerMonth: months.length ? total / months.length : 0,
      averagePerJob: entries.length ? total / entries.length : 0,
      monthsActive: months.length,
    },
    byMonth: months,
    byCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
    entries,
    generatedAt: new Date().toISOString(),
  };

  // Signed so a recipient can confirm the figures came from the platform and
  // were not edited in transit.
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify(statement.summary) + JSON.stringify(statement.byMonth))
    .digest('hex');
  const signature = jwt.sign(
    { sub: userId, digest, jobs: entries.length, total },
    passportSigningSecret(),
    { expiresIn: '90d' },
  );

  return { ...statement, signature };
};

/** Confirms a statement signature and that its figures are unaltered. */
export const verify = async (signature: string): Promise<StatementVerification> => {
  let payload: StatementClaims;
  try {
    payload = jwt.verify(signature, passportSigningSecret()) as StatementClaims;
  } catch {
    return { valid: false, reason: 'invalidSignature' };
  }

  const current = await build(payload.sub);
  if (!current) return { valid: false, reason: 'unknownHolder' };

  return {
    valid: true,
    matches:
      current.summary.jobsPaid === payload.jobs && current.summary.totalEarned === payload.total,
    holder: current.holder.name,
    statedJobs: payload.jobs,
    statedTotal: payload.total,
    currentJobs: current.summary.jobsPaid,
    currentTotal: current.summary.totalEarned,
  };
};

export const toCsv = (statement: IncomeStatement): string => {
  const header = ['date', 'gig', 'category', 'amount', 'currency', 'provider', 'reference', 'receipt'];
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = statement.entries.map((e) =>
    [
      new Date(e.date).toISOString().slice(0, 10),
      e.gig,
      e.category,
      e.amount,
      e.currency,
      e.provider,
      e.reference,
      e.receipt,
    ]
      .map(escape)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n');
};
