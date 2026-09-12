const express = require('express');
const router = express.Router();
const skillTaskController = require('../controllers/skillTaskController');
const { verifyToken } = require('../middleware/authMiddleware');
const { authorize, requireReviewer } = require('../middleware/roleMiddleware');

router.post('/', verifyToken, authorize('worker'), skillTaskController.submitTask);
router.get('/', verifyToken, skillTaskController.listTasks);
// Gated on the reviewer capability, not the role: the controller then checks
// the caller actually holds an open assignment for this task.
router.put('/:id/review', verifyToken, requireReviewer, skillTaskController.reviewTask);
router.post('/:id/appeal', verifyToken, authorize('worker'), skillTaskController.appealTask);
router.put('/:id/assign', verifyToken, authorize('admin'), skillTaskController.assignTask);

module.exports = router;
