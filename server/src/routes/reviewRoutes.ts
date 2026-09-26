import express from 'express';
import * as reviewController from '../controllers/reviewController';
import { verifyToken } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/', verifyToken, reviewController.createReview);
router.get('/', reviewController.listReviews);

export default router;
