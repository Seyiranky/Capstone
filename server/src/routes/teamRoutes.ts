import express from 'express';
import * as teamController from '../controllers/teamController';
import { verifyToken } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/:memberId/respond', verifyToken, teamController.respond);
router.post('/:memberId/endorse', verifyToken, teamController.endorse);

export default router;
