const crypto = require('crypto');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const { User, Transaction, Match, Gig, Skill } = require('../models');

const signingSecret = () =>
  process.env.PASSPORT_SIGNING_SECRET || process.env.JWT_SECRET;

const monthKey = (date) => date.toISOString().slice(0, 7);

/**
 * A verifiable record of earnings, for a lender rather than for the worker.
 *
 * The problem this addresses is that informal income is cash and undocumented,
 * so mobile-money micro-finance has no history to underwrite against. Only
 * confirmed transactions count: an initiated payment is not income.
 */
exports.build = async (userId, { from, to } = {}) => {
  const user = await User.findByPk(userId);
  if (!user) return null;

  const where = { status: 'confirmed' };
  if (from || to) {
    where.updatedAt = {};
    if (from) where.updatedAt[Op.gte] = from;
    if (to) where.updatedAt[Op.lte] = to;
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

  const entries = transactions.map((t) => ({
    date: t.updatedAt,
    amount: Number(t.amount),
    currency: 'RWF',
    provider: t.provider,
    reference: t.reference,
    gig: t.match?.gig?.title ?? null,
    category: t.match?.gig?.skill?.category ?? null,
  }));

  const total = entries.reduce((sum, e) => sum + e.amount, 0);

  const byMonth = entries.reduce((map, e) => {
    const key = monthKey(new Date(e.date));
    if (!map[key]) map[key] = { month: key, jobs: 0, total: 0 };
    map[key].jobs += 1;
    map[key].total += e.amount;
    return map;
  }, {});

  const byCategory = entries.reduce((map, e) => {
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
      from: from ? new Date(from).toISOString() : entries[0]?.date ?? null,
      to: to ? new Date(to).toISOString() : entries[entries.length - 1]?.date ?? null,
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
    signingSecret(),
    { expiresIn: '90d' },
  );

  return { ...statement, signature };
};

/** Confirms a statement signature and that its figures are unaltered. */
exports.verify = async (signature) => {
  let payload;
  try {
    payload = jwt.verify(signature, signingSecret());
  } catch {
    return { valid: false, reason: 'invalidSignature' };
  }

  const current = await exports.build(payload.sub);
  if (!current) return { valid: false, reason: 'unknownHolder' };

  return {
    valid: true,
    matches: current.summary.jobsPaid === payload.jobs && current.summary.totalEarned === payload.total,
    holder: current.holder.name,
    statedJobs: payload.jobs,
    statedTotal: payload.total,
    currentJobs: current.summary.jobsPaid,
    currentTotal: current.summary.totalEarned,
  };
};

exports.toCsv = (statement) => {
  const header = ['date', 'gig', 'category', 'amount', 'currency', 'provider', 'reference'];
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = statement.entries.map((e) =>
    [
      new Date(e.date).toISOString().slice(0, 10),
      e.gig,
      e.category,
      e.amount,
      e.currency,
      e.provider,
      e.reference,
    ]
      .map(escape)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n');
};
