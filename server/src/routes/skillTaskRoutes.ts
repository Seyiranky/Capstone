import express from 'express';
import * as skillTaskController from '../controllers/skillTaskController';
import { verifyToken } from '../middleware/authMiddleware';
import { authorize, requireReviewer } from '../middleware/roleMiddleware';
import { uploadEvidence } from '../middleware/upload';

const router = express.Router();

router.post(
  '/',
  verifyToken,
  authorize('worker'),
  uploadEvidence.array('evidence', 5),
  skillTaskController.submitTask,
);
router.get('/', verifyToken, skillTaskController.listTasks);
router.post('/declare', verifyToken, authorize('worker'), skillTaskController.declareSkill);
router.get('/my-skills', verifyToken, authorize('worker'), skillTaskController.listMySkills);
// Gated on the reviewer capability, not the role: the controller then checks
// the caller actually holds an open assignment for this task.
router.put('/:id/review', verifyToken, requireReviewer, skillTaskController.reviewTask);
router.post('/:id/appeal', verifyToken, authorize('worker'), skillTaskController.appealTask);
router.put('/:id/assign', verifyToken, authorize('admin'), skillTaskController.assignTask);

export default router;
