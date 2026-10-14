import request from 'supertest';
import app from '../../src/app';
import db from '../../src/models';

/** An MTN number the payment request accepts. */
export const CLIENT_MOMO = '0788123456';

/**
 * The client's side of finishing a job, as the app does it: mark the job done
 * (if it is still in progress), request the Mobile Money payment, and approve
 * it (the simulated provider's stand-in for the payer's PIN).
 */
export const payForJob = async (
  matchId: string,
  clientToken: string,
  { safetyNet = 0, complete = true }: { safetyNet?: number; complete?: boolean } = {},
) => {
  const auth = { Authorization: `Bearer ${clientToken}` };
  if (complete) {
    const match = await db.Match.findByPk(matchId);
    if (match?.status === 'accepted') {
      await request(app).put(`/api/matches/${matchId}/status`).set(auth).send({ status: 'completed' });
    }
  }
  const pay = await request(app).post('/api/transactions/pay').set(auth).send({ matchId, phone: CLIENT_MOMO, safetyNet });
  if (pay.status !== 201) return { pay, confirm: null };
  const confirm = await request(app).post(`/api/transactions/${pay.body.id}/confirm`).set(auth);
  return { pay, confirm };
};
