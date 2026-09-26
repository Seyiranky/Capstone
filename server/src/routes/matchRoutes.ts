import express from 'express';
import * as matchController from '../controllers/matchController';
import { verifyToken } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', verifyToken, matchController.listMatches);
router.put('/:id/status', verifyToken, matchController.updateMatchStatus);

export default router;
