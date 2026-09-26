import express from 'express';
import * as messageController from '../controllers/messageController';
import { verifyToken } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/', verifyToken, messageController.sendMessage);
router.get('/', verifyToken, messageController.listMessages);
router.get('/contacts', verifyToken, messageController.listContacts);

export default router;
