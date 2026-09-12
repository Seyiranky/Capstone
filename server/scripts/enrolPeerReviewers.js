/**
 * Enrols eligible workers as peer reviewers.
 *
 * RQ1 depends on rotation, repeat-pairing limits and quorum, none of which mean
 * anything with a pool of two or three admins: there is nobody to rotate to. A
 * peer reviewer must have earned it — verified in a category and above the
 * trust floor — so this is run after trust scores are computed, not before.
 *
 * Idempotent, and safe to re-run as more workers qualify during the pilot.
 */
const { Op } = require('sequelize');
const db = require('../models');
const {
  PEER_MIN_TRUST_SCORE,
  PEER_MIN_REVIEWS,
} = require('../services/skillVerificationService');

const run = async () => {
  const dryRun = process.argv.includes('--dry-run');

  const workers = await db.User.findAll({
    where: { role: 'worker', status: 'active' },
    order: [['trustScore', 'DESC']],
  });

  const results = [];
  for (const worker of workers) {
    const verifiedSkills = await db.UserSkill.count({
      where: { userId: worker.id, verificationStatus: 'verified' },
    });
    const qualifies =
      verifiedSkills > 0 &&
      worker.trustScore >= PEER_MIN_TRUST_SCORE &&
      worker.reviewCount >= PEER_MIN_REVIEWS;
    results.push({ worker, verifiedSkills, qualifies });
  }

  const eligible = results.filter((r) => r.qualifies);
  console.log(
    `Peer reviewer floor: trust >= ${PEER_MIN_TRUST_SCORE}, at least one verified skill,\n` +
      `and at least ${PEER_MIN_REVIEWS} reviews — a score resting on the prior is not a record.\n`,
  );
  for (const { worker, verifiedSkills, qualifies } of results) {
    const reason = qualifies
      ? 'eligible'
      : verifiedSkills === 0
        ? 'no verified skill'
        : worker.reviewCount < PEER_MIN_REVIEWS
          ? `only ${worker.reviewCount} reviews`
          : `trust ${worker.trustScore.toFixed(2)} below floor`;
    console.log(
      `  ${qualifies ? '+' : '-'} ${worker.name.padEnd(22)} trust ${worker.trustScore
        .toFixed(2)
        .padStart(5)}  skills ${verifiedSkills}  reviews ${String(worker.reviewCount).padStart(2)}  ${reason}`,
    );
  }

  if (dryRun) {
    console.log(`\nDry run: ${eligible.length} would be enrolled.`);
    await db.sequelize.close();
    return;
  }

  await Promise.all(
    eligible.map(({ worker }) => worker.update({ reviewerTier: 'peer' })),
  );
  // Anyone who has fallen below the floor stops reviewing; standing has to be
  // maintained, not granted once.
  const demoted = await db.User.update(
    { reviewerTier: null },
    {
      where: {
        role: 'worker',
        reviewerTier: 'peer',
        id: { [Op.notIn]: eligible.map((e) => e.worker.id).concat('00000000-0000-0000-0000-000000000000') },
      },
    },
  );

  const pool = await db.User.count({ where: { reviewerTier: { [Op.not]: null } } });
  console.log(`\nEnrolled ${eligible.length} peer reviewers; removed ${demoted[0]}.`);
  console.log(`Reviewer pool is now ${pool}.`);
  if (pool < 5) {
    console.log(
      'Warning: a pool this small limits rotation. Repeat-pairing exclusions may leave\n' +
        'submissions unassignable, which surfaces as tasks awaiting manual assignment.',
    );
  }

  await db.sequelize.close();
};

run().catch(async (error) => {
  console.error(error);
  await db.sequelize.close();
  process.exit(1);
});
