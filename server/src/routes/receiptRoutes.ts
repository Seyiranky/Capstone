import express from 'express';
import * as receiptController from '../controllers/receiptController';

const router = express.Router();

// Public: a lender checks a receipt without an account.
router.get('/:number', receiptController.getReceipt);

export default router;
