import express from 'express';
import * as transactionController from '../controllers/transactionController';
import { verifyToken } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/initiate', verifyToken, transactionController.initiateTransaction);
router.post('/:id/confirm', verifyToken, transactionController.confirmTransaction);
router.post('/:id/fail', verifyToken, transactionController.failTransaction);
router.get('/', verifyToken, transactionController.listTransactions);

export default router;
