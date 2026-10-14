import express from 'express';
import * as supportController from '../controllers/supportController';
import { verifyToken } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';
import { uploadSupportAttachment } from '../middleware/upload';
import { supportGuestLimiter } from '../middleware/security';

const router = express.Router();

// Signed out: one form, and the private link from the email.
router.post('/guest', supportGuestLimiter, supportController.createGuest);
router.get('/guest/:token', supportController.getGuest);
router.post('/guest/:token/messages', supportGuestLimiter, uploadSupportAttachment, supportController.replyGuest);

// Admins. Before '/tickets/:id' only by path; the prefix keeps them apart.
const admin = [verifyToken, authorize('admin')];
router.get('/admin/tickets', ...admin, supportController.adminList);
router.get('/admin/unread', ...admin, supportController.adminUnreadCount);
router.get('/admin/tickets/:id', ...admin, supportController.adminGet);
router.post('/admin/tickets/:id/messages', ...admin, uploadSupportAttachment, supportController.adminReply);
router.put('/admin/tickets/:id', ...admin, supportController.adminUpdate);
router.post('/admin/tickets/:id/escalate', ...admin, supportController.adminEscalate);
router.get('/admin/saved-replies', ...admin, supportController.listSavedReplies);
router.post('/admin/saved-replies', ...admin, supportController.createSavedReply);
router.put('/admin/saved-replies/:id', ...admin, supportController.updateSavedReply);
router.delete('/admin/saved-replies/:id', ...admin, supportController.deleteSavedReply);

// Signed in: the caller's own requests.
router.get('/linkable', verifyToken, supportController.linkable);
router.get('/unread', verifyToken, supportController.unreadCount);
router.get('/tickets', verifyToken, supportController.listMine);
router.post('/tickets', verifyToken, uploadSupportAttachment, supportController.create);
router.get('/tickets/:id', verifyToken, supportController.getMine);
router.post('/tickets/:id/messages', verifyToken, uploadSupportAttachment, supportController.replyMine);
router.post('/tickets/:id/close', verifyToken, supportController.closeMine);
router.post('/tickets/:id/rate', verifyToken, supportController.rateMine);

export default router;
