import express from 'express';
import * as reportController from '../controllers/reportController';
import { verifyToken } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/', verifyToken, reportController.createReport);

export default router;
