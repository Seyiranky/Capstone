/**
 * Recomputes every user's trust score with the current formula.
 *
 * Needed because scores written directly (by seeders, or by an earlier formula)
 * carry no breakdown, which leaves the UI showing a number it cannot explain —
 * for example a 5.00 next to "no reviews yet". Safe to re-run, and worth
 * re-running whenever the formula version changes.
 */
import { User, sequelize } from '../models';
import * as trustScoreService from '../services/trustScoreService';

const run = async () => {
  const users = await User.findAll({ attributes: ['id', 'name', 'role', 'trustScore'] });
  console.log(`Recomputing trust scores for ${users.length} users...`);

  let changed = 0;
  for (const user of users) {
    const before = user.trustScore;
    const breakdown = await trustScoreService.recalculate(user.id, { trigger: 'backfill' });
    if (!breakdown) continue;
    if (Math.abs((before ?? 0) - breakdown.score) > 0.001) changed += 1;
    console.log(
      `  ${user.name.padEnd(24)} ${user.role.padEnd(7)} -> ${breakdown.score.toFixed(2)}` +
        `${breakdown.isProvisional ? ' (provisional)' : ''}`,
    );
  }

  console.log(`Done. ${changed} of ${users.length} scores changed.`);
  await sequelize.close();
};

run().catch(async (error) => {
  console.error(error);
  await sequelize.close();
  process.exit(1);
});
