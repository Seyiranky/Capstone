import express from 'express';
import * as adminController from '../controllers/adminController';
import * as coverController from '../controllers/coverController';
import * as reportController from '../controllers/reportController';
import { verifyToken } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';

const router = express.Router();

router.get('/users', verifyToken, authorize('admin'), adminController.listUsers);
router.get('/gigs', verifyToken, authorize('admin'), adminController.listGigs);
router.get('/flagged', verifyToken, authorize('admin'), adminController.listFlagged);
router.get('/metrics', verifyToken, authorize('admin'), adminController.pilotMetrics);
router.get('/sms-health', verifyToken, authorize('admin'), adminController.smsHealth);
router.get('/reviewers', verifyToken, authorize('admin'), adminController.listReviewers);
router.get('/rejection-reasons', verifyToken, authorize('admin'), adminController.rejectionReasons);
router.get('/payments', verifyToken, authorize('admin'), adminController.payments);
router.get('/rates', verifyToken, authorize('admin'), adminController.rates);
router.get('/safety-alerts', verifyToken, authorize('admin'), adminController.safetyAlerts);
router.get('/safety-alerts/open-count', verifyToken, authorize('admin'), adminController.openSafetyAlerts);
router.put('/safety-alerts/:id/acknowledge', verifyToken, authorize('admin'), adminController.acknowledgeSafetyAlert);
router.put('/safety-alerts/:id/resolve', verifyToken, authorize('admin'), adminController.resolveSafetyAlert);
router.get('/cover-claims', verifyToken, authorize('admin'), coverController.listClaims);
router.put('/cover-claims/:id', verifyToken, authorize('admin'), coverController.decide);
router.get('/reports', verifyToken, authorize('admin'), reportController.listReports);
router.put('/reports/:id', verifyToken, authorize('admin'), reportController.resolveReport);
router.put('/users/:id/reviewer-tier', verifyToken, authorize('admin'), adminController.setReviewerTier);
router.put('/gigs/:id/review', verifyToken, authorize('admin'), adminController.reviewGig);
router.put('/gigs/:id/sensitive', verifyToken, authorize('admin'), adminController.setGigSensitive);
router.put('/users/:id/moderate', verifyToken, authorize('admin'), adminController.moderateUser);
router.delete('/users/:id', verifyToken, authorize('admin'), adminController.deleteUser);

export default router;
