const fs = require('fs');
const path = require('path');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../../app');
const db = require('../../models');

// Reviewer rotation is not what this suite tests, so keep the pool ample.
const stamp = Date.now();
const password = 'password123';
const emails = {
  worker: `ev-worker-${stamp}@example.com`,
  admin1: `ev-admin1-${stamp}@example.com`,
  admin2: `ev-admin2-${stamp}@example.com`,
  admin3: `ev-admin3-${stamp}@example.com`,
};

let skill;
let users = {};
let tokens = {};
const uploadedPaths = [];

// A one-pixel PNG and a tiny WebM-labelled blob: enough to exercise the
// pipeline without committing binary fixtures.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const AUDIO = Buffer.from('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAHT', 'base64');

beforeAll(async () => {
  skill = await db.Skill.findOne({ where: { category: 'electronics_repair' } });
  const passwordHash = await bcrypt.hash(password, 10);

  users.worker = await db.User.create({
    name: 'Evidence Worker', email: emails.worker, passwordHash, role: 'worker',
  });
  for (const key of ['admin1', 'admin2', 'admin3']) {
    users[key] = await db.User.create({
      name: `Evidence ${key}`, email: emails[key], passwordHash, role: 'admin',
    });
  }

  for (const key of Object.keys(emails)) {
    const res = await request(app).post('/api/auth/login').send({ email: emails[key], password });
    tokens[key] = res.body.token;
  }
});

afterAll(async () => {
  for (const p of uploadedPaths) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

const trackUploads = async (taskId) => {
  const rows = await db.SkillTaskEvidence.findAll({ where: { taskId } });
  for (const row of rows) {
    if (row.url.startsWith('/uploads/')) {
      uploadedPaths.push(path.join(__dirname, '..', '..', row.url.replace('/uploads/', 'uploads/')));
    }
  }
  return rows;
};

describe('submitting evidence', () => {
  test('a submission with neither a file nor a link is rejected', async () => {
    const res = await request(app)
      .post('/api/skill-tasks')
      .set('Authorization', `Bearer ${tokens.worker}`)
      .field('skillId', skill.id);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/photo, video or voice note/i);
  });

  test('a photo is accepted and fingerprinted', async () => {
    const res = await request(app)
      .post('/api/skill-tasks')
      .set('Authorization', `Bearer ${tokens.worker}`)
      .field('skillId', skill.id)
      .attach('evidence', PNG, { filename: 'work.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    const rows = await trackUploads(res.body.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('photo');
    expect(rows[0].mimeType).toBe('image/png');
    // Ties a reviewer's decision to the exact bytes they saw.
    expect(rows[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].sizeBytes).toBe(PNG.length);
  });

  test('a voice note is accepted, so evidence does not require literacy', async () => {
    const res = await request(app)
      .post('/api/skill-tasks')
      .set('Authorization', `Bearer ${tokens.worker}`)
      .field('skillId', skill.id)
      .attach('evidence', AUDIO, { filename: 'blob', contentType: 'audio/webm' });

    expect(res.status).toBe(201);
    const rows = await trackUploads(res.body.id);
    expect(rows[0].kind).toBe('voice');
    // A browser-recorded blob has no filename, so the extension comes from type.
    expect(rows[0].url).toMatch(/\.webm$/);
  });

  test('a photo and a spoken note can accompany one another', async () => {
    const res = await request(app)
      .post('/api/skill-tasks')
      .set('Authorization', `Bearer ${tokens.worker}`)
      .field('skillId', skill.id)
      .field('notes', 'Rewired a laptop charging port.')
      .attach('evidence', PNG, { filename: 'a.png', contentType: 'image/png' })
      .attach('evidence', AUDIO, { filename: 'blob', contentType: 'audio/webm' });

    expect(res.status).toBe(201);
    const rows = await trackUploads(res.body.id);
    expect(rows.map((r) => r.kind).sort()).toEqual(['photo', 'voice']);
  });

  test('a link still works, so nothing that used to submit stops working', async () => {
    const res = await request(app)
      .post('/api/skill-tasks')
      .set('Authorization', `Bearer ${tokens.worker}`)
      .field('skillId', skill.id)
      .field('evidenceUrl', 'https://example.com/portfolio');

    expect(res.status).toBe(201);
    expect(res.body.evidenceUrl).toBe('https://example.com/portfolio');
    const rows = await trackUploads(res.body.id);
    expect(rows[0].kind).toBe('link');
  });

  test('an unsupported file type is refused', async () => {
    const res = await request(app)
      .post('/api/skill-tasks')
      .set('Authorization', `Bearer ${tokens.worker}`)
      .field('skillId', skill.id)
      .attach('evidence', Buffer.from('%PDF-1.4'), {
        filename: 'cv.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('evidence reaches the reviewer', () => {
  test('the assigned reviewer receives the artifacts, not just a link', async () => {
    const submit = await request(app)
      .post('/api/skill-tasks')
      .set('Authorization', `Bearer ${tokens.worker}`)
      .field('skillId', skill.id)
      .attach('evidence', PNG, { filename: 'proof.png', contentType: 'image/png' });
    await trackUploads(submit.body.id);

    const assignment = await db.SkillTaskAssignment.findOne({
      where: { taskId: submit.body.id, status: 'pending' },
    });
    expect(assignment).toBeTruthy();

    const listed = await request(app)
      .get('/api/skill-tasks')
      .set('Authorization', `Bearer ${tokens.admin1}`);

    const task = listed.body.find((t) => t.id === submit.body.id);
    expect(task.evidence).toHaveLength(1);
    expect(task.evidence[0].kind).toBe('photo');
  });

  test('an uploaded artifact is actually served', async () => {
    const row = await db.SkillTaskEvidence.findOne({
      where: { kind: 'photo' },
      order: [['createdAt', 'DESC']],
    });
    const res = await request(app).get(row.url);
    expect(res.status).toBe(200);
  });
});
