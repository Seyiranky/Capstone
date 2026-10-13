import request from 'supertest';
import app from '../../src/app';
import db from '../../src/models';

afterAll(async () => {
  await db.sequelize.close();
});

describe('Fairwork scorecard', () => {
  test('is public, scores five principles at two checks each, and totals them', async () => {
    const res = await request(app).get('/api/fairwork');
    expect(res.status).toBe(200);
    expect(res.body.outOf).toBe(10);
    expect(res.body.principles.map((p: { key: string }) => p.key)).toEqual([
      'pay',
      'conditions',
      'contracts',
      'management',
      'representation',
    ]);
    const checks = res.body.principles.flatMap((p: { checks: { met: boolean }[] }) => p.checks);
    expect(checks).toHaveLength(10);
    expect(res.body.score).toBe(checks.filter((c: { met: boolean }) => c.met).length);
  });

  test('a check that cannot be met yet is reported as not met, not hidden', async () => {
    const res = await request(app).get('/api/fairwork');
    const voice = res.body.principles
      .find((p: { key: string }) => p.key === 'representation')
      .checks.find((c: { key: string }) => c.key === 'workerVoice');
    expect(voice.met).toBe(false);
  });
});
