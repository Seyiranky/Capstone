const db = require('../../models');
const service = require('../../services/collusionDetectionService');

let skill;
const createdUserIds = [];
const createdTaskIds = [];

const makeUser = async (role, overrides = {}) => {
  const user = await db.User.create({
    name: `CD ${role} ${Math.random().toString(36).slice(2, 8)}`,
    email: `cd-${role}-${Math.random().toString(36).slice(2, 10)}@example.com`,
    passwordHash: 'x',
    role,
    ...overrides,
  });
  createdUserIds.push(user.id);
  return user;
};

/**
 * A decided task and its assignment, with explicit timings and pool size so
 * each detector can be driven directly.
 */
const decided = async (
  workerId,
  reviewerId,
  { status = 'approved', secondsToDecide = 3600, poolSize = 6 } = {},
) => {
  const task = await db.SkillTask.create({
    workerId,
    skillId: skill.id,
    reviewerId,
    evidenceUrl: 'https://example.com/e',
    status,
  });
  createdTaskIds.push(task.id);
  const assignedAt = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  await db.SkillTaskAssignment.create({
    taskId: task.id,
    reviewerId,
    round: 1,
    status,
    assignedAt,
    decidedAt: new Date(assignedAt.getTime() + secondsToDecide * 1000),
    eligiblePoolSize: poolSize,
    // A real assignment always carries its seed; rows without one were
    // backfilled and their timings are not observations.
    assignmentSeed: `test-seed-${Math.random().toString(36).slice(2)}`,
  });
  return task;
};

const flagsFor = (report, type, { workerId, reviewerId } = {}) =>
  report.flags.filter(
    (f) =>
      f.type === type &&
      (workerId ? f.workerId === workerId : true) &&
      (reviewerId ? f.reviewerId === reviewerId : true),
  );

beforeAll(async () => {
  skill = await db.Skill.findOne({ where: { category: 'electronics_repair' } });
});

afterAll(async () => {
  await db.SkillTask.destroy({ where: { id: createdTaskIds } });
  await db.User.destroy({ where: { id: createdUserIds } });
  await db.sequelize.close();
});

describe('rubber-stamp detection', () => {
  test('an approval returned in seconds is flagged', async () => {
    const worker = await makeUser('worker');
    const reviewer = await makeUser('admin');
    await decided(worker.id, reviewer.id, { secondsToDecide: 4 });

    const report = await service.report();
    const flags = flagsFor(report, 'rubberStamped', { workerId: worker.id });
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe('high');
    expect(flags[0].evidence.secondsToDecision).toBeCloseTo(4, 1);
  });

  test('a backfilled assignment is not flagged on its approximated timing', async () => {
    const worker = await makeUser('worker');
    const reviewer = await makeUser('admin');
    const task = await db.SkillTask.create({
      workerId: worker.id,
      skillId: skill.id,
      reviewerId: reviewer.id,
      evidenceUrl: 'https://example.com/e',
      status: 'approved',
    });
    createdTaskIds.push(task.id);
    const at = new Date();
    // No assignmentSeed: assignedAt and decidedAt were copied from the task,
    // not measured, so an apparent zero-second decision means nothing.
    await db.SkillTaskAssignment.create({
      taskId: task.id,
      reviewerId: reviewer.id,
      round: 1,
      status: 'approved',
      assignedAt: at,
      decidedAt: at,
    });

    const report = await service.report();
    expect(flagsFor(report, 'rubberStamped', { workerId: worker.id })).toHaveLength(0);
  });

  test('an approval that took real time is not flagged', async () => {
    const worker = await makeUser('worker');
    const reviewer = await makeUser('admin');
    await decided(worker.id, reviewer.id, { secondsToDecide: 1800 });

    const report = await service.report();
    expect(flagsFor(report, 'rubberStamped', { workerId: worker.id })).toHaveLength(0);
  });
});

describe('repeated pairing detection', () => {
  test('a pair recurring far above chance is flagged with the numbers behind it', async () => {
    const worker = await makeUser('worker');
    const reviewer = await makeUser('admin');
    // Six of this worker's tasks all landing on one reviewer, from a pool of
    // six, is far beyond what uniform assignment would produce.
    for (let i = 0; i < 6; i += 1) {
      await decided(worker.id, reviewer.id, { poolSize: 6 });
    }

    const report = await service.report();
    const flags = flagsFor(report, 'repeatedPairing', { workerId: worker.id });
    expect(flags).toHaveLength(1);
    expect(flags[0].evidence.pairings).toBe(6);
    expect(flags[0].evidence.expectedPairings).toBeCloseTo(1, 1);
    expect(flags[0].evidence.standardDeviations).toBeGreaterThan(2);
    expect(flags[0].severity).toBe('high');
  });

  test('assignments spread across reviewers are not flagged', async () => {
    const worker = await makeUser('worker');
    const reviewers = await Promise.all([
      makeUser('admin'),
      makeUser('admin'),
      makeUser('admin'),
      makeUser('admin'),
    ]);
    for (const reviewer of reviewers) {
      await decided(worker.id, reviewer.id, { poolSize: 6 });
    }

    const report = await service.report();
    expect(flagsFor(report, 'repeatedPairing', { workerId: worker.id })).toHaveLength(0);
  });
});

describe('prior relationship detection', () => {
  test('a reviewer who hired the worker is flagged', async () => {
    const worker = await makeUser('worker');
    const reviewer = await makeUser('client', { reviewerTier: 'admin' });

    const gig = await db.Gig.create({
      clientId: reviewer.id,
      skillId: skill.id,
      title: 'Relationship gig',
      description: 'Fixture',
      budget: 10000,
      locationLat: -1.95,
      locationLng: 30.06,
      status: 'completed',
    });
    await db.Match.create({ gigId: gig.id, workerId: worker.id, status: 'completed' });
    await decided(worker.id, reviewer.id);

    const report = await service.report();
    const flags = flagsFor(report, 'priorGigRelationship', { workerId: worker.id });
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe('high');
  });
});

describe('report shape', () => {
  test('the reviewer load distribution is reported for audit', async () => {
    const worker = await makeUser('worker');
    const reviewer = await makeUser('admin');
    await decided(worker.id, reviewer.id);

    const report = await service.report();
    const row = report.reviewerLoad.find((r) => r.reviewerId === reviewer.id);
    expect(row.assignments).toBeGreaterThanOrEqual(1);
    expect(row.share).toBeGreaterThan(0);
    expect(report.summary.assignments).toBeGreaterThan(0);
    expect(report.summary.distinctReviewers).toBeGreaterThan(0);
  });

  test('flags are ordered with the most severe first', async () => {
    const report = await service.report();
    const rank = { high: 0, medium: 1, low: 2 };
    const ranks = report.flags.map((f) => rank[f.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  test('every flag carries evidence rather than only a label', async () => {
    const report = await service.report();
    for (const flag of report.flags) {
      expect(flag.evidence).toBeTruthy();
      expect(Object.keys(flag.evidence).length).toBeGreaterThan(0);
    }
  });
});
