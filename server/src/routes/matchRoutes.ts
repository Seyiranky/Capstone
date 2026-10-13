import express from 'express';
import * as matchController from '../controllers/matchController';
import { verifyToken } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', verifyToken, matchController.listMatches);
router.put('/:id/status', verifyToken, matchController.updateMatchStatus);
router.post('/:id/complete', verifyToken, matchController.completeWithCode);
router.post('/:id/work-done', verifyToken, matchController.markWorkDone);

export default router;
