/**
 * Generates the RQ3 randomisation list.
 *
 * Run this once, before recruitment begins, and record the seed it prints in
 * the dissertation's methods section. Fixing the sequence in advance is what
 * makes the allocation concealed: whoever registers participants cannot see or
 * steer which arm comes next.
 *
 * Re-running discards any unclaimed entries and starts a fresh sequence, which
 * is how you clear allocations consumed by testing before going live. It
 * refuses to discard entries that real participants already hold, unless
 * --force says otherwise.
 *
 *   npx tsx src/scripts/generateAllocationList.ts --size 40
 *   npx tsx src/scripts/generateAllocationList.ts --size 40 --seed my-recorded-seed
 */
import { ExperimentAllocation, sequelize } from '../models';
import * as allocationService from '../services/allocationService';
import type { ExperimentArm } from '../types/domain';

const argOf = (flag: string, fallback?: string): string | undefined => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1];
};

const run = async () => {
  const size = Number(argOf('--size', '40'));
  const seed = argOf('--seed', undefined);
  const force = process.argv.includes('--force');

  if (!Number.isInteger(size) || size < 2) {
    throw new Error('--size must be an integer of at least 2');
  }

  const existing = await ExperimentAllocation.findAll({
    where: { experiment: allocationService.EXPERIMENT },
  });
  const claimed = existing.filter((row) => row.claimedByUserId);

  if (claimed.length > 0 && !force) {
    console.error(
      `Refusing to regenerate: ${claimed.length} allocation(s) are already held by\n` +
        'registered participants. Regenerating would detach them from the sequence they\n' +
        'were assigned under. Re-run with --force only if this is still test data.',
    );
    await sequelize.close();
    process.exit(1);
  }

  await ExperimentAllocation.destroy({ where: { experiment: allocationService.EXPERIMENT } });

  const { seed: usedSeed, rows } = allocationService.generateSequence(size, seed);
  await ExperimentAllocation.bulkCreate(rows);

  const blocks = [...new Set(rows.map((r) => r.blockIndex))].length;
  const counts = rows.reduce<Partial<Record<ExperimentArm, number>>>(
    (acc, r) => ({ ...acc, [r.arm]: (acc[r.arm] ?? 0) + 1 }),
    {},
  );

  console.log(`Generated ${rows.length} allocations across ${blocks} blocks.`);
  console.log(
    `Arms: ${Object.entries(counts)
      .map(([a, n]) => `${a}=${n}`)
      .join(', ')}`,
  );
  console.log(`Block sizes used: ${[...new Set(rows.map((r) => r.blockSize))].join(', ')}`);
  console.log(`\nSeed (record this in your methods section):\n  ${usedSeed}\n`);
  console.log('First 12 positions:');
  console.log(
    `  ${rows
      .slice(0, 12)
      .map((r) => `${r.position}:${r.arm === 'provenance' ? 'P' : 'C'}`)
      .join('  ')}`,
  );

  await sequelize.close();
};

run().catch(async (error) => {
  console.error(error);
  await sequelize.close();
  process.exit(1);
});
