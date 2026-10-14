import express from 'express';
import * as transactionController from '../controllers/transactionController';
import { verifyToken } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';

const router = express.Router();

router.post('/pay', verifyToken, authorize('client'), transactionController.payForJob);
router.get('/:id', verifyToken, transactionController.getTransaction);
router.post('/:id/confirm', verifyToken, transactionController.confirmTransaction);
router.post('/:id/fail', verifyToken, transactionController.failTransaction);
router.get('/', verifyToken, transactionController.listTransactions);

export default router;
