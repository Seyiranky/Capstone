import express from 'express';
import * as gigApplicationController from '../controllers/gigApplicationController';
import { verifyToken } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';

const router = express.Router();

router.post('/', verifyToken, authorize('worker'), gigApplicationController.applyToGig);
router.get('/', verifyToken, gigApplicationController.listApplications);
router.put('/:id/review', verifyToken, authorize('admin'), gigApplicationController.reviewApplication);

export default router;
