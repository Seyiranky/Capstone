import express from 'express';
import * as safetyNetController from '../controllers/safetyNetController';
import { verifyToken } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';

const router = express.Router();

router.get('/me', verifyToken, authorize('worker'), safetyNetController.mine);
router.put('/me/savings', verifyToken, authorize('worker'), safetyNetController.setSavings);
router.post('/me/withdraw', verifyToken, authorize('worker'), safetyNetController.withdraw);

export default router;
