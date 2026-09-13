const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { idempotent } = require('../middleware/idempotency');

// Unauthenticated by necessity — a payment provider has no session. The shared
// secret header and the idempotency key are what stand in for one.
router.post(
  '/payments/:provider',
  idempotent('payment-callback'),
  webhookController.paymentCallback,
);

module.exports = router;
