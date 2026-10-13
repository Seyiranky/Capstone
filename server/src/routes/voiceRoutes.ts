import express from 'express';
import * as voiceController from '../controllers/voiceController';
import { optionalAuth, verifyToken } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';

const router = express.Router();

router.get('/', optionalAuth, voiceController.list);
router.post('/:id/vote', verifyToken, authorize('worker'), voiceController.vote);
router.post('/', verifyToken, authorize('admin'), voiceController.create);
router.put('/:id/close', verifyToken, authorize('admin'), voiceController.close);

export default router;
