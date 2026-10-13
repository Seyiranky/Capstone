import express from 'express';
import * as authController from '../controllers/authController';
import * as phoneVerificationController from '../controllers/phoneVerificationController';
import { verifyToken } from '../middleware/authMiddleware';
import { emailLinkLimiter, loginLimiter, signupLimiter, smsCodeLimiter } from '../middleware/security';

const router = express.Router();

router.post('/register', signupLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/google', loginLimiter, authController.googleLogin);
router.post('/forgot-password', emailLinkLimiter, authController.forgotPassword);
router.post('/reset-password', emailLinkLimiter, authController.resetPassword);
// Requesting a link needs a session, since it mails the caller's own address.
// Following one does not: the link is opened from a mail client, and the token
// in it is the proof.
router.post('/send-verification', verifyToken, emailLinkLimiter, authController.sendVerificationEmail);
router.post('/verify-email', emailLinkLimiter, authController.verifyEmail);
// Both need a session: the code is typed into the app, not opened from a link.
router.post('/send-phone-code', verifyToken, smsCodeLimiter, phoneVerificationController.sendPhoneCode);
router.put('/password', verifyToken, loginLimiter, authController.changePassword);
router.post('/verify-phone', verifyToken, smsCodeLimiter, phoneVerificationController.verifyPhone);

export default router;
