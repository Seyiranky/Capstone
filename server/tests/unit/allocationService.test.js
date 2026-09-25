const db = require('../../src/models');
const service = require('../../src/services/allocationService');

const createdUserIds = [];

const makeClient = async () => {
  const user = await db.User.create({
    name: `Alloc ${Math.random().toString(36).slice(2, 8)}`,
    email: `alloc-${Math.random().toString(36).slice(2, 10)}@example.com`,
    passwordHash: 'x',
    role: 'client',
  });
  createdUserIds.push(user.id);
  return user;
};

const resetList = async (size, seed) => {
  await db.ExperimentAllocation.destroy({ where: { experiment: service.EXPERIMENT } });
  const { rows } = service.generateSequence(size, seed);
  await db.ExperimentAllocation.bulkCreate(rows);
  return rows;
};

afterAll(async () => {
  await db.ExperimentAllocation.destroy({ where: { experiment: service.EXPERIMENT } });
  await db.User.destroy({ where: { id: createdUserIds } });
  await db.sequelize.close();
});

describe('sequence generation', () => {
  test('every block holds equal numbers of both arms', () => {
    const { rows } = service.generateSequence(60, 'block-balance');
    const blocks = rows.reduce((acc, row) => {
      (acc[row.blockIndex] = acc[row.blockIndex] ?? []).push(row.arm);
      return acc;
    }, {});

    // The final block may be truncated by the requested length.
    const complete = Object.values(blocks).filter((b, i, all) => i < all.length - 1);
    for (const block of complete) {
      const provenance = block.filter((a) => a === 'provenance').length;
      expect(provenance).toBe(block.length / 2);
    }
  });

  test('imbalance never exceeds half a block at any point in the sequence', () => {
    const { rows } = service.generateSequence(80, 'imbalance-bound');
    const maxBlock = Math.max(...service.BLOCK_SIZES);

    let provenance = 0;
    let plain = 0;
    for (const row of rows) {
      if (row.arm === 'provenance') provenance += 1;
      else plain += 1;
      // This is the property the whole design exists for: however many people
      // actually enrol, the arms cannot drift apart.
      expect(Math.abs(provenance - plain)).toBeLessThanOrEqual(maxBlock / 2);
    }
  });

  test('the same seed reproduces the same sequence', () => {
    const a = service.generateSequence(30, 'reproducible');
    const b = service.generateSequence(30, 'reproducible');
    expect(a.rows.map((r) => r.arm)).toEqual(b.rows.map((r) => r.arm));
  });

  test('different seeds give different sequences', () => {
    const a = service.generateSequence(30, 'seed-one');
    const b = service.generateSequence(30, 'seed-two');
    expect(a.rows.map((r) => r.arm)).not.toEqual(b.rows.map((r) => r.arm));
  });

  test('the order is not a predictable alternation', () => {
    const { rows } = service.generateSequence(40, 'not-alternating');
    const arms = rows.map((r) => r.arm);
    // Strict alternation is what makes an assignment guessable by whoever
    // registers participants, which is the failure this replaced.
    const alternating = arms.every((arm, i) => i === 0 || arm !== arms[i - 1]);
    expect(alternating).toBe(false);
  });

  test('mixed block sizes are used, so the tail of a block is not deducible', () => {
    const { rows } = service.generateSequence(80, 'mixed-blocks');
    expect(new Set(rows.map((r) => r.blockSize)).size).toBeGreaterThan(1);
  });

  test('the seed is recorded on every row so the list can be audited', () => {
    const { seed, rows } = service.generateSequence(10, 'recorded');
    expect(seed).toBe('recorded');
    expect(rows.every((r) => r.seed === 'recorded')).toBe(true);
  });
});

describe('claiming', () => {
  test('claims are handed out in sequence order', async () => {
    const rows = await resetList(6, 'claim-order');
    const taken = [];
    for (let i = 0; i < 3; i += 1) {
      const user = await makeClient();
      taken.push(await service.claimArm(user.id));
    }
    expect(taken).toEqual(rows.slice(0, 3).map((r) => r.arm));
  });

  test('simultaneous registrations never receive the same position', async () => {
    await resetList(8, 'concurrent');
    const users = await Promise.all([1, 2, 3, 4].map(() => makeClient()));

    // The failure mode of counting rows then writing: two registrations read
    // the same count and land in the same arm.
    await Promise.all(users.map((u) => service.claimArm(u.id)));

    const claimed = await db.ExperimentAllocation.findAll({
      where: { experiment: service.EXPERIMENT, claimedByUserId: users.map((u) => u.id) },
    });
    expect(claimed).toHaveLength(4);
    expect(new Set(claimed.map((c) => c.position)).size).toBe(4);
    expect(new Set(claimed.map((c) => c.claimedByUserId)).size).toBe(4);
  });

  test('an exhausted list returns null rather than inventing an arm', async () => {
    await resetList(2, 'exhausted');
    await service.claimArm((await makeClient()).id);
    await service.claimArm((await makeClient()).id);

    expect(await service.claimArm((await makeClient()).id)).toBeNull();
  });

  test('status reports balance and what is left', async () => {
    await resetList(10, 'status');
    await service.claimArm((await makeClient()).id);
    await service.claimArm((await makeClient()).id);

    const status = await service.status();
    expect(status.total).toBe(10);
    expect(status.claimed).toBe(2);
    expect(status.remaining).toBe(8);
    expect(status.imbalance).toBeLessThanOrEqual(Math.max(...service.BLOCK_SIZES) / 2);
    expect(status.seed).toBe('status');
    expect(status.exhausted).toBe(false);
  });
});
