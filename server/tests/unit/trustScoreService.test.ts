import db from '../../src/models';
import * as trustScoreService from '../../src/services/trustScoreService';
import { must } from '../helpers/fixtures';
import type { Role } from '../../src/types/domain';

const DAY_MS = 1000 * 60 * 60 * 24;

let skill: InstanceType<typeof db.Skill>;
let client: InstanceType<typeof db.User>;
const createdUserIds: string[] = [];

const makeUser = async (role: Role, overrides = {}) => {
  const user = await db.User.create({
    name: `Trust ${role} ${Math.random().toString(36).slice(2, 8)}`,
    email: `trust-${role}-${Math.random().toString(36).slice(2, 10)}@example.com`,
    passwordHash: 'x',
    role,
    ...overrides,
  });
  createdUserIds.push(user.id);
  return user;
};

/** Gives a worker a completed match plus a review of the given rating and age. */
const giveReview = async (worker: any, { rating, ageDays = 0 }: { rating: number; ageDays?: number }) => {
  const gig = await db.Gig.create({
    clientId: client.id,
    skillId: skill.id,
    title: 'Trust fixture gig',
    description: 'Fixture',
    budget: 10000,
    locationLat: -1.95,
    locationLng: 30.06,
    status: 'completed',
  });
  const match = await db.Match.create({
    gigId: gig.id,
    workerId: worker.id,
    status: 'completed',
    acceptedAt: new Date(),
  });
  const createdAt = new Date(Date.now() - ageDays * DAY_MS);
  await db.Review.create({
    matchId: match.id,
    authorId: client.id,
    recipientId: worker.id,
    rating,
    createdAt,
    updatedAt: createdAt,
  }, { silent: true });
  return match;
};

/** A match the worker accepted and then abandoned. */
const abandonMatch = async (worker: any, { ageDays = 0 } = {}) => {
  const gig = await db.Gig.create({
    clientId: client.id,
    skillId: skill.id,
    title: 'Abandoned fixture gig',
    description: 'Fixture',
    budget: 10000,
    locationLat: -1.95,
    locationLng: 30.06,
    status: 'open',
  });
  const at = new Date(Date.now() - ageDays * DAY_MS);
  return db.Match.create({
    gigId: gig.id,
    workerId: worker.id,
    status: 'cancelled',
    acceptedAt: at,
    respondedAt: at,
    updatedAt: at,
  }, { silent: true });
};

beforeAll(async () => {
  skill = must(await db.Skill.findOne({ where: { category: 'tailoring' } }), 'skill');
  client = await makeUser('client');
});

afterAll(async () => {
  await db.User.destroy({ where: { id: createdUserIds } });
  await db.sequelize.close();
});

describe('provisional scores', () => {
  test('a worker with no reviews is marked provisional, not badly rated', async () => {
    const worker = await makeUser('worker');
    const breakdown = must(await trustScoreService.recalculate(worker.id), 'breakdown');

    expect(breakdown.isProvisional).toBe(true);
    const rating = must(breakdown.components.find((c: any) => c.key === 'rating'), 'rating');
    expect(rating.detail.reviewCount).toBe(0);
    // The prior, not zero: absence of evidence must not read as bad evidence.
    expect(rating.detail.shrunkMean).toBeCloseTo(trustScoreService.PRIOR_MEAN, 5);
  });

  test('a single review no longer makes the score provisional', async () => {
    const worker = await makeUser('worker');
    await giveReview(worker, { rating: 5 });
    const breakdown = must(await trustScoreService.recalculate(worker.id), 'breakdown');
    expect(breakdown.isProvisional).toBe(false);
  });
});

describe('volume confidence (the shrinkage fix)', () => {
  test('one 5-star review ranks below a long record of 4-star reviews', async () => {
    const newcomer = await makeUser('worker');
    await giveReview(newcomer, { rating: 5 });

    const veteran = await makeUser('worker');
    for (let i = 0; i < 20; i += 1) {
      await giveReview(veteran, { rating: 4 });
    }

    const newcomerScore = (await trustScoreService.recalculate(newcomer.id))!.score;
    const veteranScore = (await trustScoreService.recalculate(veteran.id))!.score;

    expect(veteranScore).toBeGreaterThan(newcomerScore);
  });

  test('a perfect record converges upward as review volume grows', async () => {
    const worker = await makeUser('worker');
    await giveReview(worker, { rating: 5 });
    const afterOne = (await trustScoreService.recalculate(worker.id))!.score;

    for (let i = 0; i < 15; i += 1) {
      await giveReview(worker, { rating: 5 });
    }
    const afterSixteen = (await trustScoreService.recalculate(worker.id))!.score;

    expect(afterSixteen).toBeGreaterThan(afterOne);
  });
});

describe('recency weighting', () => {
  test('an old review counts for less than a recent one of the same rating', async () => {
    const recent = await makeUser('worker');
    await giveReview(recent, { rating: 5, ageDays: 0 });

    const stale = await makeUser('worker');
    await giveReview(stale, { rating: 5, ageDays: 720 });

    const recentScore = (await trustScoreService.recalculate(recent.id))!.score;
    const staleScore = (await trustScoreService.recalculate(stale.id))!.score;

    expect(recentScore).toBeGreaterThan(staleScore);
  });

  test('a review at the half-life carries about half its original weight', async () => {
    const worker = await makeUser('worker');
    await giveReview(worker, { rating: 5, ageDays: 180 });
    const breakdown = must(await trustScoreService.recalculate(worker.id), 'breakdown');
    const rating = must(breakdown.components.find((c: any) => c.key === 'rating'), 'rating');
    expect(rating.detail.effectiveReviewWeight).toBeCloseTo(0.5, 2);
  });
});

describe('reliability signals', () => {
  test('abandoning accepted work lowers the score', async () => {
    const reliable = await makeUser('worker');
    await giveReview(reliable, { rating: 4 });

    const flaky = await makeUser('worker');
    await giveReview(flaky, { rating: 4 });
    await abandonMatch(flaky);
    await abandonMatch(flaky);
    await abandonMatch(flaky);

    const reliableScore = (await trustScoreService.recalculate(reliable.id))!.score;
    const flakyScore = (await trustScoreService.recalculate(flaky.id))!.score;

    expect(flakyScore).toBeLessThan(reliableScore);
  });

  test('declining while still pending is not penalised', async () => {
    const worker = await makeUser('worker');
    await giveReview(worker, { rating: 4 });
    const before = (await trustScoreService.recalculate(worker.id))!.score;

    // Declined before accepting: acceptedAt stays null.
    const gig = await db.Gig.create({
      clientId: client.id,
      skillId: skill.id,
      title: 'Declined fixture gig',
      description: 'Fixture',
      budget: 10000,
      locationLat: -1.95,
      locationLng: 30.06,
      status: 'open',
    });
    await db.Match.create({
      gigId: gig.id,
      workerId: worker.id,
      status: 'cancelled',
      respondedAt: new Date(),
      declineReason: 'Not free that week',
    });

    const after = (await trustScoreService.recalculate(worker.id))!.score;
    // The score decays with time, so two runs milliseconds apart differ in the
    // tenth decimal place. A decline penalty would move it by far more than this.
    expect(after).toBeCloseTo(before, 6);
  });

  test('the abandonment penalty decays out of the recency window', async () => {
    const recentlyFlaky = await makeUser('worker');
    await giveReview(recentlyFlaky, { rating: 4 });
    await abandonMatch(recentlyFlaky, { ageDays: 1 });
    await abandonMatch(recentlyFlaky, { ageDays: 2 });
    await abandonMatch(recentlyFlaky, { ageDays: 3 });

    const reformed = await makeUser('worker');
    await giveReview(reformed, { rating: 4 });
    await abandonMatch(reformed, { ageDays: 200 });
    await abandonMatch(reformed, { ageDays: 210 });
    await abandonMatch(reformed, { ageDays: 220 });

    const recentBreakdown = must(await trustScoreService.recalculate(recentlyFlaky.id), 'recentBreakdown');
    const reformedBreakdown = must(await trustScoreService.recalculate(reformed.id), 'reformedBreakdown');

    expect(recentBreakdown.penalty.value).toBeGreaterThan(0);
    expect(reformedBreakdown.penalty.value).toBe(0);
    expect(reformedBreakdown.score).toBeGreaterThan(recentBreakdown.score);
  });
});

describe('verification contribution', () => {
  test('verifying a skill raises a worker score', async () => {
    const worker = await makeUser('worker');
    await giveReview(worker, { rating: 4 });
    const before = (await trustScoreService.recalculate(worker.id))!.score;

    await db.UserSkill.create({
      userId: worker.id,
      skillId: skill.id,
      verificationStatus: 'verified',
      proficiencyLevel: 3,
    });

    const after = (await trustScoreService.recalculate(worker.id))!.score;
    expect(after).toBeGreaterThan(before);
  });

  test('clients are scored without a verification component, not penalised for lacking one', async () => {
    const scoredClient = await makeUser('client');
    const breakdown = must(await trustScoreService.recalculate(scoredClient.id), 'breakdown');

    const keys = breakdown.components.map((c: any) => c.key);
    expect(keys).not.toContain('verification');
    // Weights are renormalised so the achievable maximum is still the full scale.
    const weightSum = breakdown.components.reduce((sum, c) => sum + c.weight, 0);
    expect(weightSum).toBeCloseTo(1, 10);
  });
});

describe('auditability', () => {
  test('every recalculation appends an immutable snapshot', async () => {
    const worker = await makeUser('worker');
    await trustScoreService.recalculate(worker.id, { trigger: 'test:first' });
    await giveReview(worker, { rating: 5 });
    await trustScoreService.recalculate(worker.id, { trigger: 'test:second' });

    const snapshots = await db.TrustScoreSnapshot.findAll({
      where: { userId: worker.id },
      order: [['createdAt', 'ASC']],
    });

    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((s) => s.trigger)).toEqual(['test:first', 'test:second']);
    expect(snapshots[0].formulaVersion).toBe(trustScoreService.FORMULA_VERSION);
  });

  test('the persisted breakdown explains the stored score', async () => {
    const worker = await makeUser('worker');
    await giveReview(worker, { rating: 4 });
    const breakdown = must(await trustScoreService.recalculate(worker.id), 'breakdown');

    const positive = breakdown.components.reduce((sum, c) => sum + c.contribution, 0);
    expect(breakdown.score).toBeCloseTo(5 * (positive - breakdown.penalty.value), 6);

    const reloaded = must(await db.User.findByPk(worker.id), 'reloaded');
    expect(reloaded.trustScore).toBeCloseTo(breakdown.score, 6);
    expect(reloaded.trustScoreBreakdown!.formulaVersion!).toBe(trustScoreService.FORMULA_VERSION);
    expect(reloaded.reviewCount).toBe(1);
  });
});
