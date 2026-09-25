const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/', verifyToken, reviewController.createReview);
router.get('/', reviewController.listReviews);

module.exports = router;
