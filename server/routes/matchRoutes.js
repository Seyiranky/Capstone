const express = require('express');
const router = express.Router();
const matchController = require('../controllers/matchController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/', verifyToken, matchController.listMatches);
router.put('/:id/status', verifyToken, matchController.updateMatchStatus);

module.exports = router;
