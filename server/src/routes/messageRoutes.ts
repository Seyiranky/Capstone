import express from 'express';
import * as messageController from '../controllers/messageController';
import { verifyToken } from '../middleware/authMiddleware';
import { uploadMessageMedia } from '../middleware/upload';

const router = express.Router();

// Multipart only when a photo or voice note is attached; JSON text messages pass straight through.
router.post('/', verifyToken, uploadMessageMedia, messageController.sendMessage);
router.get('/', verifyToken, messageController.listMessages);
router.get('/contacts', verifyToken, messageController.listContacts);
router.post('/read', verifyToken, messageController.markRead);

export default router;
