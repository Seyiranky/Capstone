import express from 'express';
import * as webhookController from '../controllers/webhookController';
import { idempotent } from '../middleware/idempotency';

const router = express.Router();

// Unauthenticated by necessity — a payment provider has no session. The shared
// secret header and the idempotency key are what stand in for one.
router.post(
  '/payments/:provider',
  idempotent('payment-callback'),
  webhookController.paymentCallback,
);

export default router;
