const express = require('express');
const router = express.Router();
const skillTaskController = require('../controllers/skillTaskController');
const { verifyToken } = require('../middleware/authMiddleware');
const { authorize, requireReviewer } = require('../middleware/roleMiddleware');
const { uploadEvidence } = require('../middleware/upload');

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

module.exports = router;
