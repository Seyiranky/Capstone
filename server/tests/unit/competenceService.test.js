const db = require('../../src/models');
const service = require('../../src/services/competenceService');

let skill;
const createdUserIds = [];

const makeUser = async (role, overrides = {}) => {
  const user = await db.User.create({
    name: `CS ${role} ${Math.random().toString(36).slice(2, 8)}`,
    email: `cs-${role}-${Math.random().toString(36).slice(2, 10)}@example.com`,
    passwordHash: 'x',
    role,
    ...overrides,
  });
  createdUserIds.push(user.id);
  return user;
};

const declare = (userId) =>
  db.UserSkill.create({
    userId,
    skillId: skill.id,
    proficiencyLevel: 1,
    verificationStatus: 'unverified',
    provenance: 'self_declared',
    credentialStrength: service.TIERS.self_declared,
    selfDeclaredAt: new Date(),
  });

const approvedTask = (workerId, kind) =>
  db.SkillTask.create({
    workerId,
    skillId: skill.id,
    kind,
    evidenceUrl: '/uploads/evidence/x.jpg',
    status: 'approved',
    claim: kind === 'certificate' ? { title: 'TVET Level 3', issuer: 'WDA' } : null,
  });

/** A completed job in this skill, optionally reviewed by the client. */
const completedJob = async (workerId, clientId, { reviewed = true } = {}) => {
  const gig = await db.Gig.create({
    clientId,
    skillId: skill.id,
    title: 'Competence fixture',
    description: 'Fixture',
    budget: 10000,
    locationLat: -1.95,
    locationLng: 30.06,
    status: 'completed',
  });
  const match = await db.Match.create({
    gigId: gig.id,
    workerId,
    status: 'completed',
    acceptedAt: new Date(),
    respondedAt: new Date(),
  });
  if (reviewed) {
    await db.Review.create({
      matchId: match.id,
      authorId: clientId,
      recipientId: workerId,
      rating: 5,
    });
  }
  return match;
};

beforeAll(async () => {
  skill = await db.Skill.findOne({ where: { category: 'tutoring', parentId: null } });
});

afterAll(async () => {
  await db.User.destroy({ where: { id: createdUserIds } });
  await db.sequelize.close();
});

describe('provenance tiers', () => {
  test('a worker who only says so is self-declared, and worth something but little', async () => {
    const worker = await makeUser('worker');
    await declare(worker.id);

    const result = await service.recalculate(worker.id, skill.id);
    expect(result.provenance).toBe('self_declared');
    expect(result.credentialStrength).toBe(service.TIERS.self_declared);
    // Nonzero on purpose: a zero would make an unproven worker unrankable and
    // recreate the cold-start exclusion the platform exists to break.
    expect(result.credentialStrength).toBeGreaterThan(0);
  });

  test('a sighted certificate outranks a self-declaration', async () => {
    const worker = await makeUser('worker');
    await declare(worker.id);
    await approvedTask(worker.id, 'certificate');

    const result = await service.recalculate(worker.id, skill.id);
    expect(result.provenance).toBe('document_sighted');
    expect(result.credentialStrength).toBeGreaterThan(service.TIERS.self_declared);
  });

  test('an approved demonstration outranks a sighted document', async () => {
    const worker = await makeUser('worker');
    await declare(worker.id);
    await approvedTask(worker.id, 'certificate');
    await approvedTask(worker.id, 'demonstration');

    const result = await service.recalculate(worker.id, skill.id);
    expect(result.provenance).toBe('peer_reviewed');
    expect(result.credentialStrength).toBe(service.TIERS.peer_reviewed);
  });

  test('enough reviewed work outranks everything else', async () => {
    const worker = await makeUser('worker');
    const client = await makeUser('client');
    await declare(worker.id);
    for (let i = 0; i < service.JOBS_FOR_WORK_EARNED; i += 1) {
      await completedJob(worker.id, client.id);
    }

    const result = await service.recalculate(worker.id, skill.id);
    expect(result.provenance).toBe('work_earned');
    expect(result.credentialStrength).toBe(1);
  });

  test('unreviewed completions do not count toward work earned', async () => {
    const worker = await makeUser('worker');
    const client = await makeUser('client');
    await declare(worker.id);
    for (let i = 0; i < service.JOBS_FOR_WORK_EARNED + 1; i += 1) {
      // A completion nobody reviewed is the worker's own word about their work.
      await completedJob(worker.id, client.id, { reviewed: false });
    }

    const result = await service.recalculate(worker.id, skill.id);
    expect(result.provenance).toBe('self_declared');
    expect(result.detail.completedJobs).toBeGreaterThan(0);
    expect(result.detail.reviewedJobs).toBe(0);
  });
});

describe('monotonicity', () => {
  test('a tier once reached is never taken away', async () => {
    const worker = await makeUser('worker');
    const userSkill = await declare(worker.id);
    await approvedTask(worker.id, 'demonstration');
    await service.recalculate(worker.id, skill.id);

    // The evidence disappears, as it might if a task were purged.
    await db.SkillTask.destroy({ where: { workerId: worker.id } });
    const after = await service.recalculate(worker.id, skill.id);

    expect(after.provenance).toBe('peer_reviewed');
    expect(userSkill).toBeTruthy();
  });

  test('adding evidence can only raise a claim', async () => {
    const worker = await makeUser('worker');
    const client = await makeUser('client');
    await declare(worker.id);

    const seen = [];
    seen.push((await service.recalculate(worker.id, skill.id)).credentialStrength);
    await approvedTask(worker.id, 'certificate');
    seen.push((await service.recalculate(worker.id, skill.id)).credentialStrength);
    await approvedTask(worker.id, 'demonstration');
    seen.push((await service.recalculate(worker.id, skill.id)).credentialStrength);
    for (let i = 0; i < service.JOBS_FOR_WORK_EARNED; i += 1) {
      await completedJob(worker.id, client.id);
    }
    seen.push((await service.recalculate(worker.id, skill.id)).credentialStrength);

    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(seen).size).toBe(4);
  });
});

describe('bookkeeping', () => {
  test('the detail records what the tier was based on', async () => {
    const worker = await makeUser('worker');
    await declare(worker.id);
    await approvedTask(worker.id, 'certificate');

    const result = await service.recalculate(worker.id, skill.id, { trigger: 'test' });
    expect(result.detail.sightedCertificates).toBe(1);
    expect(result.detail.approvedDemonstrations).toBe(0);
    expect(result.detail.trigger).toBe('test');
  });

  test('a worker without the skill is not invented', async () => {
    const worker = await makeUser('worker');
    expect(await service.recalculate(worker.id, skill.id)).toBeNull();
  });
});
