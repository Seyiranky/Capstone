import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import db from '../../src/models';
import { must } from '../helpers/fixtures';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `sv-worker-${stamp}@example.com`,
  worker2: `sv-worker2-${stamp}@example.com`,
  worker3: `sv-worker3-${stamp}@example.com`,
  admin1: `sv-admin1-${stamp}@example.com`,
  admin2: `sv-admin2-${stamp}@example.com`,
  admin3: `sv-admin3-${stamp}@example.com`,
  admin4: `sv-admin4-${stamp}@example.com`,
  admin5: `sv-admin5-${stamp}@example.com`,
  admin6: `sv-admin6-${stamp}@example.com`,
  peer: `sv-peer-${stamp}@example.com`,
};

let skill: InstanceType<typeof db.Skill>;
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};

const login = async (email: string) => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
};

/** Whichever reviewer currently holds the open assignment for a task. */
const openAssignee = async (taskId: string) => {
  const assignment = must(await db.SkillTaskAssignment.findOne({
    where: { taskId, status: 'pending' },
  }), 'assignment');
  return assignment?.reviewerId ?? null;
};

/**
 * A token for whoever holds the assignment.
 *
 * The reviewer pool is the whole test database, so an assignment can land on a
 * reviewer another suite created. Minting a token directly keeps this suite
 * testing the rotation mechanism rather than its own fixture list.
 */
const tokenForUserId = async (userId: string | null | undefined) => {
  if (!userId) throw new Error('no open assignment: the eligible reviewer pool was exhausted');
  const key = Object.keys(users).find((k) => users[k].id === userId);
  if (key) return tokens[key];
  const user = must(await db.User.findByPk(userId), 'user');
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
};

beforeAll(async () => {
  skill = must(await db.Skill.findOne({ where: { category: 'digital_web' } }), 'skill');
  const passwordHash = await bcrypt.hash(password, 10);

  for (const key of ['worker', 'worker2', 'worker3']) {
    users[key] = await db.User.create({
      name: `SV ${key}`, email: emails[key], passwordHash, role: 'worker',
    });
  }
  for (const key of ['admin1', 'admin2', 'admin3', 'admin4', 'admin5', 'admin6']) {
    users[key] = await db.User.create({
      name: `SV ${key}`, email: emails[key], passwordHash, role: 'admin',
    });
  }
  users.peer = await db.User.create({
    name: 'SV Peer', email: emails.peer, passwordHash, role: 'worker',
    // A track record, not just a score: shrinkage lets an unreviewed worker
    // clear the trust floor on the prior alone.
    trustScore: 4.6, reviewCount: 4,
  });

  for (const key of Object.keys(emails)) {
    tokens[key] = await login(emails[key]);
  }
});

afterAll(async () => {
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('reviewer enrolment', () => {
  test('an admin is a reviewer on creation, without being granted it', async () => {
    const admin = must(await db.User.findByPk(users.admin1.id), 'admin');
    expect(admin.reviewerTier).toBe('admin');
  });

  test('a worker with no verified skill cannot be enrolled as a peer reviewer', async () => {
    const res = await request(app)
      .put(`/api/admin/users/${users.peer.id}/reviewer-tier`)
      .set('Authorization', `Bearer ${tokens.admin1}`)
      .send({ reviewerTier: 'peer' });
    expect(res.status).toBe(409);
  });

  test('a verified, well-rated worker can be enrolled', async () => {
    await db.UserSkill.create({
      userId: users.peer.id,
      skillId: skill.id,
      verificationStatus: 'verified',
      proficiencyLevel: 4,
    });

    const res = await request(app)
      .put(`/api/admin/users/${users.peer.id}/reviewer-tier`)
      .set('Authorization', `Bearer ${tokens.admin1}`)
      .send({ reviewerTier: 'peer' });
    expect(res.status).toBe(200);
    expect(res.body.reviewerTier).toBe('peer');
  });

  test('a high score resting on no reviews does not qualify', async () => {
    const unproven = await db.User.create({
      name: 'SV Unproven',
      email: `sv-unproven-${stamp}@example.com`,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'worker',
      trustScore: 4.9,
      reviewCount: 0,
    });
    await db.UserSkill.create({
      userId: unproven.id, skillId: skill.id,
      verificationStatus: 'verified', proficiencyLevel: 3,
    });

    const res = await request(app)
      .put(`/api/admin/users/${unproven.id}/reviewer-tier`)
      .set('Authorization', `Bearer ${tokens.admin1}`)
      .send({ reviewerTier: 'peer' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/reviews/i);
    await unproven.destroy();
  });

  test('someone not enrolled cannot review at all', async () => {
    const res = await request(app)
      .put('/api/skill-tasks/00000000-0000-0000-0000-000000000000/review')
      .set('Authorization', `Bearer ${tokens.worker}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(403);
  });
});

describe('quorum for a first verification', () => {
  let taskId: string;
  let firstReviewerId: string;

  test('a first submission requires two approvals', async () => {
    const res = await request(app)
      .post('/api/skill-tasks')
      .set('Authorization', `Bearer ${tokens.worker}`)
      .send({ skillId: skill.id, evidenceUrl: 'https://example.com/portfolio' });

    expect(res.status).toBe(201);
    expect(res.body.requiredApprovals).toBe(2);
    expect(res.body.quorumRationale).toBe('firstVerification');
    taskId = res.body.id;
    firstReviewerId = await openAssignee(taskId);
    expect(firstReviewerId).toBeTruthy();
  });

  test('a reviewer without the open assignment cannot decide it', async () => {
    const outsiderKey = ['admin1', 'admin2', 'admin3', 'admin4', 'admin5', 'admin6'].find(
      (k) => users[k].id !== firstReviewerId,
    );
    const res = await request(app)
      .put(`/api/skill-tasks/${taskId}/review`)
      .set('Authorization', `Bearer ${tokens[outsiderKey as string]}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(403);
  });

  test('one approval is not enough: the task stays pending with a second reviewer', async () => {
    const res = await request(app)
      .put(`/api/skill-tasks/${taskId}/review`)
      .set('Authorization', `Bearer ${await tokenForUserId(firstReviewerId)}`)
      .send({ decision: 'approved', confidence: 5 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');

    const secondReviewerId = await openAssignee(taskId);
    expect(secondReviewerId).toBeTruthy();
    expect(secondReviewerId).not.toBe(firstReviewerId);
  });

  test('the second approval settles it and sets the reviewer-judged level', async () => {
    const secondReviewerId = await openAssignee(taskId);
    const res = await request(app)
      .put(`/api/skill-tasks/${taskId}/review`)
      .set('Authorization', `Bearer ${await tokenForUserId(secondReviewerId)}`)
      .send({ decision: 'approved', confidence: 4, proficiencyLevel: 4 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');

    const userSkill = must(await db.UserSkill.findOne({
      where: { userId: users.worker.id, skillId: skill.id },
    }), 'userSkill');
    expect(userSkill.verificationStatus).toBe('verified');
    // Previously pinned at 1 regardless of what the reviewer saw.
    expect(userSkill.proficiencyLevel).toBe(4);
  });

  test('verification raised the trust score', async () => {
    const worker = must(await db.User.findByPk(users.worker.id), 'worker');
    expect(worker.trustScore).toBeGreaterThan(0);
    expect(worker.trustScoreBreakdown!.components.map!((c: any) => c.key)).toContain('verification');
  });

  test('each round is recorded with its own assignment row for audit', async () => {
    const assignments = await db.SkillTaskAssignment.findAll({
      where: { taskId },
      order: [['round', 'ASC']],
    });
    expect(assignments).toHaveLength(2);
    expect(assignments.map((a) => a.round)).toEqual([1, 2]);
    expect(assignments.every((a) => a.assignmentSeed)).toBe(true);
    expect(assignments.every((a) => a.decidedAt)).toBe(true);
    // Distinct reviewers: the same person cannot supply both approvals.
    expect(new Set(assignments.map((a) => a.reviewerId)).size).toBe(2);
  });
});

describe('low confidence escalates', () => {
  test('an unsure reviewer does not decide alone', async () => {
    // Already verified in this skill, so this submission needs one approval.
    await db.UserSkill.create({
      userId: users.worker3.id,
      skillId: skill.id,
      verificationStatus: 'verified',
      proficiencyLevel: 2,
    });
    const submit = await request(app)
      .post('/api/skill-tasks')
      .set('Authorization', `Bearer ${tokens.worker3}`)
      .send({ skillId: skill.id, evidenceUrl: 'https://example.com/second' });
    const taskId = submit.body.id;
    expect(submit.body.requiredApprovals).toBe(1);

    const reviewerId = await openAssignee(taskId);
    const res = await request(app)
      .put(`/api/skill-tasks/${taskId}/review`)
      .set('Authorization', `Bearer ${await tokenForUserId(reviewerId)}`)
      .send({ decision: 'approved', confidence: 2 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(res.body.requiredApprovals).toBe(2);
  });
});

describe('disagreement and appeal', () => {
  let taskId: string;

  test('a split decision is flagged and escalated to a third reviewer', async () => {
    const submit = await request(app)
      .post('/api/skill-tasks')
      .set('Authorization', `Bearer ${tokens.worker2}`)
      .send({ skillId: skill.id, evidenceUrl: 'https://example.com/contested' });
    expect(submit.status).toBe(201);
    expect(submit.body.awaitingReviewer).toBeUndefined();
    taskId = submit.body.id;

    const first = await openAssignee(taskId);
    await request(app)
      .put(`/api/skill-tasks/${taskId}/review`)
      .set('Authorization', `Bearer ${await tokenForUserId(first)}`)
      .send({ decision: 'approved', confidence: 4 });

    const second = await openAssignee(taskId);
    const res = await request(app)
      .put(`/api/skill-tasks/${taskId}/review`)
      .set('Authorization', `Bearer ${await tokenForUserId(second)}`)
      .send({ decision: 'rejected', confidence: 4 });

    expect(res.status).toBe(200);
    expect(res.body.disagreementFlag).toBe(true);

    const third = await openAssignee(taskId);
    expect([first, second]).not.toContain(third);
  });

  test('the majority of the three settles the outcome', async () => {
    const third = await openAssignee(taskId);
    const res = await request(app)
      .put(`/api/skill-tasks/${taskId}/review`)
      .set('Authorization', `Bearer ${await tokenForUserId(third)}`)
      .send({ decision: 'rejected', confidence: 5 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
  });

  test('an appeal reassigns the task away from everyone who has seen it', async () => {
    const priorReviewers = (
      await db.SkillTaskAssignment.findAll({ where: { taskId }, attributes: ['reviewerId'] })
    ).map((a) => a.reviewerId);

    const res = await request(app)
      .post(`/api/skill-tasks/${taskId}/appeal`)
      .set('Authorization', `Bearer ${tokens.worker2}`)
      .send({ reason: 'The reviewer did not open the linked evidence.' });

    expect(res.status).toBe(201);
    expect(res.body.appeal.status).toBe('upheld');
    expect(res.body.task.status).toBe('pending');

    const newAssignee = await openAssignee(taskId);
    expect(newAssignee).toBeTruthy();
    expect(priorReviewers).not.toContain(newAssignee);
  });

  test('a submission cannot be appealed twice', async () => {
    const res = await request(app)
      .post(`/api/skill-tasks/${taskId}/appeal`)
      .set('Authorization', `Bearer ${tokens.worker2}`)
      .send({ reason: 'Trying again.' });
    expect(res.status).toBe(409);
  });

  test('only the submitting worker may appeal', async () => {
    const res = await request(app)
      .post(`/api/skill-tasks/${taskId}/appeal`)
      .set('Authorization', `Bearer ${tokens.peer}`)
      .send({ reason: 'Not mine.' });
    expect(res.status).toBe(403);
  });
});

describe('collusion report replaces the stub', () => {
  test('the admin endpoint returns an audit rather than 501', async () => {
    const res = await request(app)
      .get('/api/admin/flagged')
      .set('Authorization', `Bearer ${tokens.admin1}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.assignments).toBeGreaterThan(0);
    expect(Array.isArray(res.body.flags)).toBe(true);
    expect(Array.isArray(res.body.reviewerLoad)).toBe(true);
  });

  test('rotation spread this worker across multiple reviewers', async () => {
    const assignments = await db.SkillTaskAssignment.findAll({
      include: [
        {
          model: db.SkillTask,
          as: 'task',
          where: { workerId: users.worker.id },
          required: true,
        },
      ],
    });
    // Repeat-pairing limits and tie-break exclusions mean no single reviewer
    // saw everything this worker submitted.
    expect(new Set(assignments.map((a) => a.reviewerId)).size).toBeGreaterThan(1);
  });
});
