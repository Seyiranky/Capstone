const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/me', verifyToken, userController.getProfile);
router.put('/me', verifyToken, userController.updateProfile);
router.get('/me/export', verifyToken, userController.exportMyData);
router.get('/:id', verifyToken, userController.getPublicProfile);
router.get('/:id/skills', verifyToken, userController.getUserSkills);

module.exports = router;
