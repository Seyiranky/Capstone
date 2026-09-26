import express from 'express';
import * as surveyController from '../controllers/surveyController';
import { verifyToken } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/', verifyToken, surveyController.submitResponse);
router.get('/', verifyToken, surveyController.listResponses);

export default router;
