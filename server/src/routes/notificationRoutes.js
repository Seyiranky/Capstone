const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/', verifyToken, notificationController.listNotifications);
router.put('/:id/read', verifyToken, notificationController.markRead);

module.exports = router;
