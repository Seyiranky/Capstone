import express from 'express';
import * as messageController from '../controllers/messageController';
import { verifyToken } from '../middleware/authMiddleware';
import { uploadMessageImage } from '../middleware/upload';

const router = express.Router();

// Multipart only when a photo is attached; JSON text messages pass straight through.
router.post('/', verifyToken, uploadMessageImage.single('image'), messageController.sendMessage);
router.get('/', verifyToken, messageController.listMessages);
router.get('/contacts', verifyToken, messageController.listContacts);
router.post('/read', verifyToken, messageController.markRead);

export default router;
