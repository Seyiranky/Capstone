import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import * as skillVerificationService from '../../src/services/skillVerificationService';
import { must } from '../helpers/fixtures';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `rr-worker-${stamp}@example.com`,
  worker2: `rr-worker2-${stamp}@example.com`,
  worker3: `rr-worker3-${stamp}@example.com`,
  peer: `rr-peer-${stamp}@example.com`,
  admin1: `rr-admin1-${stamp}@example.com`,
  admin2: `rr-admin2-${stamp}@example.com`,
};

let skill: InstanceType<typeof db.Skill>;
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

/**
 * Submits evidence as a worker and hands the open assignment to the peer.
 *
 * One worker per submission: the rotation keeps a reviewer off a worker's last
 * three tasks, which in a small test pool would leave nobody to draw.
 */
const submitForPeer = async (label: string, who = 'worker') => {
  const res = await request(app)
    .post('/api/skill-tasks')
    .set(as(who))
    .send({ skillId: skill.id, evidenceUrl: `https://example.com/${label}` });
  expect(res.status).toBe(201);
  const open = must(await db.SkillTaskAssignment.findOne({ where: { taskId: res.body.id, status: 'pending' } }), 'assignment');
  await open.update({ reviewerId: users.peer.id });
  return res.body.id as string;
};

beforeAll(async () => {
  skill = must(await db.Skill.findOne({ where: { category: 'digital_web' } }), 'skill');
  const passwordHash = await bcrypt.hash(password, 10);
  users.worker = await db.User.create({ name: 'Recusal Worker', email: emails.worker, passwordHash, role: 'worker' });
  users.worker2 = await db.User.create({ name: 'Recusal Worker 2', email: emails.worker2, passwordHash, role: 'worker' });
  users.worker3 = await db.User.create({ name: 'Recusal Worker 3', email: emails.worker3, passwordHash, role: 'worker' });
  users.peer = await db.User.create({
    name: 'Recusal Peer', email: emails.peer, passwordHash, role: 'worker',
    trustScore: 4.6, reviewCount: 4, reviewerTier: 'peer',
  });
  await db.UserSkill.create({ userId: users.peer.id, skillId: skill.id, verificationStatus: 'verified', proficiencyLevel: 4 });
  for (const key of ['admin1', 'admin2']) {
    users[key] = await db.User.create({ name: `Recusal ${key}`, email: emails[key], passwordHash, role: 'admin' });
  }
  for (const key of Object.keys(emails)) {
    const res = await request(app).post('/api/auth/login').send({ email: emails[key], password });
    tokens[key] = res.body.token;
  }
});

afterAll(async () => {
  const workerIds = [users.worker.id, users.worker2.id, users.worker3.id];
  const tasks = await db.SkillTask.findAll({ where: { workerId: workerIds }, attributes: ['id'] });
  const taskIds = tasks.map((t) => t.id);
  await db.SkillTaskEvidence.destroy({ where: { taskId: taskIds } });
  await db.SkillTaskAssignment.destroy({ where: { taskId: taskIds } });
  await db.SkillTask.destroy({ where: { id: taskIds } });
  await db.UserSkill.destroy({ where: { userId: [users.peer.id, ...workerIds] } });
  await db.Notification.destroy({ where: { userId: Object.values(users).map((u) => u.id) } });
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('a peer reviewer’s queue', () => {
  test('lists the submissions assigned to them, blind to other reviewers’ verdicts', async () => {
    const taskId = await submitForPeer('blind');
    // An earlier round decided by someone else, as after a first approval.
    await db.SkillTaskAssignment.create({
      taskId, reviewerId: users.admin1.id, round: 0, status: 'approved', confidence: 5, decidedAt: new Date(),
    });

    const res = await request(app).get('/api/skill-tasks').query({ assignedToMe: 'true' }).set(as('peer'));
    expect(res.status).toBe(200);
    const task = res.body.find((t: { id: string }) => t.id === taskId);
    expect(task).toBeTruthy();
    expect(task.assignments).toHaveLength(1);
    expect(task.assignments[0].reviewerId).toBe(users.peer.id);
    expect(task.reviewer).toBeUndefined();
    // The worker's name is shown, so a reviewer can tell they know them.
    expect(task.worker.name).toBe('Recusal Worker');
  });

  test('the peer decides through the peer route', async () => {
    const taskId = await submitForPeer('decide', 'worker2');
    const res = await request(app)
      .put(`/api/skill-tasks/${taskId}/review`)
      .set(as('peer'))
      .send({ decision: 'approved', confidence: 5, proficiencyLevel: 3 });
    expect(res.status).toBe(200);
    const mine = must(await db.SkillTaskAssignment.findOne({ where: { taskId, reviewerId: users.peer.id } }), 'assignment');
    expect(mine.status).toBe('approved');
  });
});

describe('stepping aside (recusal)', () => {
  let taskId: string;

  test('needs a known reason', async () => {
    taskId = await submitForPeer('recuse', 'worker3');
    const res = await request(app).put(`/api/skill-tasks/${taskId}/recuse`).set(as('peer')).send({ reason: 'bored' });
    expect(res.status).toBe(400);
  });

  test('someone who is not a reviewer cannot recuse', async () => {
    const res = await request(app).put(`/api/skill-tasks/${taskId}/recuse`).set(as('worker')).send({ reason: 'conflict' });
    expect(res.status).toBe(403);
  });

  test('records the disclosure and hands the submission to another reviewer', async () => {
    const res = await request(app)
      .put(`/api/skill-tasks/${taskId}/recuse`)
      .set(as('peer'))
      .send({ reason: 'knowsWorker', notes: 'He is my cousin.' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recused: true, reassigned: true });

    const seats = await db.SkillTaskAssignment.findAll({ where: { taskId } });
    const mine = must(seats.find((a) => a.reviewerId === users.peer.id), 'peer seat');
    expect(mine.status).toBe('recused');
    expect(mine.recusalReason).toBe('knowsWorker');
    const next = must(seats.find((a) => a.status === 'pending'), 'next seat');
    expect(next.reviewerId).not.toBe(users.peer.id);

    const again = await request(app).put(`/api/skill-tasks/${taskId}/recuse`).set(as('peer')).send({ reason: 'conflict' });
    expect(again.status).toBe(403);
  });

  test('a reviewer who knows the worker is never drawn for them again', async () => {
    const disclosed = await skillVerificationService.disclosedRelationships(users.worker3.id);
    expect(disclosed.has(users.peer.id)).toBe(true);
    // The disclosure is about this worker only.
    const other = await skillVerificationService.disclosedRelationships(users.worker2.id);
    expect(other.has(users.peer.id)).toBe(false);
  });

  test('the collusion audit counts recusals by reason', async () => {
    const res = await request(app).get('/api/admin/flagged').set(as('admin1'));
    expect(res.status).toBe(200);
    expect(res.body.summary.recusals.total).toBeGreaterThanOrEqual(1);
    expect(res.body.summary.recusals.byReason.knowsWorker).toBeGreaterThanOrEqual(1);
  });
});
