import express from 'express';
import * as webhookController from '../controllers/webhookController';
import * as smsWebhookController from '../controllers/smsWebhookController';
import { idempotent } from '../middleware/idempotency';

const router = express.Router();

// Unauthenticated by necessity — a payment provider has no session. The shared
// secret header and the idempotency key are what stand in for one.
router.post(
  '/payments/:provider',
  idempotent('payment-callback'),
  webhookController.paymentCallback,
);

// Pindo's delivery reports. No idempotency key: applying the same report twice
// leaves the row as it was, so a duplicate is harmless on its own.
router.post('/sms/pindo', smsWebhookController.pindoDeliveryReport);

export default router;
