import express from 'express';
import * as gigApplicationController from '../controllers/gigApplicationController';
import { requireConfirmedContact, verifyToken } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';

const router = express.Router();

router.post('/', verifyToken, authorize('worker'), requireConfirmedContact, gigApplicationController.applyToGig);
router.get('/', verifyToken, gigApplicationController.listApplications);
router.get('/eligibility', verifyToken, authorize('worker'), gigApplicationController.eligibility);
// The gig's client decides; an admin may step in. The controller checks ownership.
router.put('/:id/review', verifyToken, authorize('client', 'admin'), gigApplicationController.reviewApplication);

export default router;
