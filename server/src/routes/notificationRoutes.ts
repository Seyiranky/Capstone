import express from 'express';
import * as notificationController from '../controllers/notificationController';
import { verifyToken } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', verifyToken, notificationController.listNotifications);
router.put('/:id/read', verifyToken, notificationController.markRead);

export default router;
