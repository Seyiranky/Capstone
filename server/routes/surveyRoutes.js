const express = require('express');
const router = express.Router();
const surveyController = require('../controllers/surveyController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/', verifyToken, surveyController.submitResponse);
router.get('/', verifyToken, surveyController.listResponses);

module.exports = router;
