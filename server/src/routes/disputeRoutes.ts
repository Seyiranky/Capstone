import express from 'express';
import * as disputeController from '../controllers/disputeController';
import { verifyToken } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';

const router = express.Router();

router.get('/', verifyToken, disputeController.listDisputes);
router.get('/eligible', verifyToken, disputeController.eligible);
router.post('/', verifyToken, disputeController.openDispute);
router.post('/:id/response', verifyToken, disputeController.respond);
router.post('/:id/votes', verifyToken, disputeController.vote);
router.post('/:id/resolve', verifyToken, authorize('admin'), disputeController.resolve);

export default router;
