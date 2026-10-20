import { Op } from 'sequelize';
import db from '../../src/models';
import * as service from '../../src/services/skillVerificationService';
import { must } from '../helpers/fixtures';
import type { Role } from '../../src/types/domain';

const DAY_MS = 1000 * 60 * 60 * 24;

let skill: InstanceType<typeof db.Skill>;
let otherSkill: InstanceType<typeof db.Skill>;
const createdUserIds: string[] = [];

const makeUser = async (role: Role, overrides = {}) => {
  const user = await db.User.create({
    name: `SV ${role} ${Math.random().toString(36).slice(2, 8)}`,
    email: `sv-${role}-${Math.random().toString(36).slice(2, 10)}@example.com`,
    passwordHash: 'x',
    role,
    ...overrides,
  });
  createdUserIds.push(user.id);
  return user;
};

const makeAdminReviewer = () => makeUser('admin', { reviewerTier: 'admin' });

const makePeerReviewer = async ({ trustScore = 4.5, skillId }: { trustScore?: number; skillId?: string } = {}) => {
  const peer = await makeUser('worker', { reviewerTier: 'peer', trustScore });
  await db.UserSkill.create({
    userId: peer.id,
    skillId: skillId ?? skill.id,
    verificationStatus: 'verified',
    proficiencyLevel: 3,
  });
  return peer;
};

/** A decided task for `workerId` reviewed by `reviewerId`, `ageDays` old. */
const pastTask = async (workerId: string, reviewerId: string, { ageDays = 0 } = {}) => {
  const at = new Date(Date.now() - ageDays * DAY_MS);
  const task = await db.SkillTask.create(
    {
      workerId,
      skillId: skill.id,
      reviewerId,
      evidenceUrl: 'https://example.com/evidence',
      status: 'approved',
      createdAt: at,
      updatedAt: at,
    },
    { silent: true },
  );
  await db.SkillTaskAssignment.create(
    {
      taskId: task.id,
      reviewerId,
      round: 1,
      status: 'approved',
      assignedAt: at,
      decidedAt: at,
      createdAt: at,
      updatedAt: at,
    },
    { silent: true },
  );
  return task;
};

beforeAll(async () => {
  skill = must(await db.Skill.findOne({ where: { category: 'tailoring' } }), 'skill');
  otherSkill = must(await db.Skill.findOne({ where: { category: 'tutoring' } }), 'otherSkill');
});

afterAll(async () => {
  await db.User.destroy({ where: { id: createdUserIds } });
  await db.sequelize.close();
});

describe('reviewer eligibility', () => {
  test('a worker is never assigned to review their own submission', async () => {
    // The worker is themselves an enrolled reviewer.
    const worker = await makePeerReviewer();
    const other = await makeAdminReviewer();

    const { reviewer, audit } = await service.assignReviewer(worker.id, skill.id);
    expect(reviewer).toBeTruthy();
    expect(reviewer!.id).not.toBe(worker.id);
    expect(audit.rejections).toEqual(
      expect.arrayContaining([{ reviewerId: worker.id, rule: 'self' }]),
    );
    expect(other).toBeTruthy();
  });

  test('a reviewer of the worker last three tasks is excluded', async () => {
    const worker = await makeUser('worker');
    const recent = await makeAdminReviewer();
    const fresh = await makeAdminReviewer();
    await pastTask(worker.id, recent.id);

    const { reviewer, audit } = await service.assignReviewer(worker.id, skill.id);
    expect(reviewer!.id).not.toBe(recent.id);
    expect(audit.rejections).toEqual(
      expect.arrayContaining([{ reviewerId: recent.id, rule: 'recentPairing' }]),
    );
    expect(fresh).toBeTruthy();
  });

  test('a pair that has already met twice in the window is excluded', async () => {
    const worker = await makeUser('worker');
    const overused = await makeAdminReviewer();
    const fresh = await makeAdminReviewer();

    // Old enough to fall outside the "last three tasks" rule but inside the
    // 90-day pairing window, so the pairing limit is what excludes them.
    await pastTask(worker.id, overused.id, { ageDays: 30 });
    await pastTask(worker.id, overused.id, { ageDays: 40 });
    await pastTask(worker.id, fresh.id, { ageDays: 1 });
    await pastTask(worker.id, fresh.id, { ageDays: 2 });
    await pastTask(worker.id, fresh.id, { ageDays: 3 });

    const { audit } = await service.assignReviewer(worker.id, skill.id);
    const rules = audit.rejections.filter((r) => r.reviewerId === overused.id).map((r) => r.rule);
    expect(rules).toContain('pairingLimit');
  });

  test('a reviewer who has worked with the worker on a gig is excluded', async () => {
    const worker = await makeUser('worker');
    const collaborator = await makeUser('client', { reviewerTier: 'admin' });
    const fresh = await makeAdminReviewer();

    const gig = await db.Gig.create({
      clientId: collaborator.id,
      skillId: skill.id,
      title: 'Prior relationship gig',
      description: 'Fixture',
      budget: 10000,
      locationLat: -1.95,
      locationLng: 30.06,
      status: 'completed',
    });
    await db.Match.create({ gigId: gig.id, workerId: worker.id, status: 'completed' });

    const { reviewer, audit } = await service.assignReviewer(worker.id, skill.id);
    expect(reviewer!.id).not.toBe(collaborator.id);
    expect(audit.rejections).toEqual(
      expect.arrayContaining([{ reviewerId: collaborator.id, rule: 'priorGigRelationship' }]),
    );
    expect(fresh).toBeTruthy();
  });

  test('a peer reviewer unverified in the category cannot judge it', async () => {
    const worker = await makeUser('worker');
    // Verified in tutoring, asked to judge tailoring.
    const wrongCategory = await makePeerReviewer({ skillId: otherSkill.id });
    const admin = await makeAdminReviewer();

    const { reviewer, audit } = await service.assignReviewer(worker.id, skill.id);
    expect(reviewer!.id).not.toBe(wrongCategory.id);
    expect(audit.rejections).toEqual(
      expect.arrayContaining([{ reviewerId: wrongCategory.id, rule: 'notCategoryCompetent' }]),
    );
    expect(admin).toBeTruthy();
  });

  test('a peer reviewer below the trust floor cannot judge', async () => {
    const worker = await makeUser('worker');
    const lowTrust = await makePeerReviewer({ trustScore: 2 });
    const admin = await makeAdminReviewer();

    const { reviewer, audit } = await service.assignReviewer(worker.id, skill.id);
    expect(reviewer!.id).not.toBe(lowTrust.id);
    expect(audit.rejections).toEqual(
      expect.arrayContaining([{ reviewerId: lowTrust.id, rule: 'peerTrustTooLow' }]),
    );
    expect(admin).toBeTruthy();
  });

  test('an explicitly excluded reviewer cannot see the task again', async () => {
    const worker = await makeUser('worker');
    const first = await makeAdminReviewer();
    const second = await makeAdminReviewer();

    const { reviewer, audit } = await service.assignReviewer(worker.id, skill.id, {
      exclude: [first.id],
      reason: 'appeal',
    });
    expect(reviewer!.id).not.toBe(first.id);
    expect(audit.reason).toBe('appeal');
    expect(second).toBeTruthy();
    expect(audit.rejections).toEqual(
      expect.arrayContaining([{ reviewerId: first.id, rule: 'alreadyReviewed' }]),
    );
  });

  test('an empty eligible pool returns no reviewer rather than a bad one', async () => {
    const worker = await makePeerReviewer();
    const { reviewer, audit } = await service.assignReviewer(worker.id, skill.id, {
      exclude: (
        await db.User.findAll({ where: { reviewerTier: { [Op.not]: null } } })
      ).map((u) => u.id),
    });
    expect(reviewer).toBeNull();
    expect(audit.eligibleCount).toBe(0);
  });
});

describe('assignment auditability', () => {
  test('every assignment records a replayable seed and the pool size', async () => {
    const worker = await makeUser('worker');
    await makeAdminReviewer();
    await makeAdminReviewer();

    const { reviewer, audit } = await service.assignReviewer(worker.id, skill.id);
    expect(reviewer).toBeTruthy();
    expect(audit.seed).toMatch(new RegExp(`^${worker.id}:${skill.id}:initial:`));
    expect(audit.eligibleCount).toBeGreaterThan(0);
    expect(audit.poolSize).toBeGreaterThanOrEqual(audit.eligibleCount);
  });

  test('assignment levels the queue before drawing at random', async () => {
    const worker = await makeUser('worker');
    const busy = await makeAdminReviewer();
    const idle = await makeAdminReviewer();

    // Give the busy reviewer an open assignment on someone else's task.
    const other = await makeUser('worker');
    const task = await db.SkillTask.create({
      workerId: other.id,
      skillId: skill.id,
      reviewerId: busy.id,
      evidenceUrl: 'https://example.com/e',
      status: 'pending',
    });
    await db.SkillTaskAssignment.create({
      taskId: task.id,
      reviewerId: busy.id,
      round: 1,
      status: 'pending',
      assignedAt: new Date(),
    });

    const { reviewer, audit } = await service.assignReviewer(worker.id, skill.id);
    expect(reviewer!.id).not.toBe(busy.id);
    expect(audit.minPendingLoad).toBe(0);
    expect(idle).toBeTruthy();
  });
});

describe('quorum rules', () => {
  test('a worker with nothing verified yet needs two approvals', async () => {
    const worker = await makeUser('worker');
    const { requiredApprovals, rationale } = await service.requiredApprovalsFor(worker.id);
    expect(requiredApprovals).toBe(2);
    expect(rationale).toBe('firstVerification');
  });

  test('an established worker needs only one approval', async () => {
    const worker = await makeUser('worker');
    await db.UserSkill.create({
      userId: worker.id,
      skillId: skill.id,
      verificationStatus: 'verified',
      proficiencyLevel: 2,
    });
    const { requiredApprovals, rationale } = await service.requiredApprovalsFor(worker.id);
    expect(requiredApprovals).toBe(1);
    expect(rationale).toBe('establishedWorker');
  });

  test('a prior rejection reinstates quorum', async () => {
    const worker = await makeUser('worker');
    await db.UserSkill.create({
      userId: worker.id,
      skillId: skill.id,
      verificationStatus: 'verified',
      proficiencyLevel: 2,
    });
    await db.SkillTask.create({
      workerId: worker.id,
      skillId: skill.id,
      evidenceUrl: 'https://example.com/e',
      status: 'rejected',
    });

    const { requiredApprovals, rationale } = await service.requiredApprovalsFor(worker.id);
    expect(requiredApprovals).toBe(2);
    expect(rationale).toBe('priorRejection');
  });
});
