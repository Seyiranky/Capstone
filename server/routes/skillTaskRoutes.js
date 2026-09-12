const express = require('express');
const router = express.Router();
const skillTaskController = require('../controllers/skillTaskController');
const { verifyToken } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.post('/', verifyToken, authorize('worker'), skillTaskController.submitTask);
router.get('/', verifyToken, skillTaskController.listTasks);
router.put('/:id/review', verifyToken, authorize('admin'), skillTaskController.reviewTask);

module.exports = router;
