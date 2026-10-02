import express from 'express';
import * as authController from '../controllers/authController';
import { verifyToken } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/google', authController.googleLogin);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
// Requesting a link needs a session, since it mails the caller's own address.
// Following one does not: the link is opened from a mail client, and the token
// in it is the proof.
router.post('/send-verification', verifyToken, authController.sendVerificationEmail);
router.post('/verify-email', authController.verifyEmail);

export default router;
