import express from 'express';
import * as workerDirectoryController from '../controllers/workerDirectoryController';
import * as gigController from '../controllers/gigController';
import { optionalAuth, requireConfirmedContact, verifyToken } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';
import { uploadGigMedia } from '../middleware/upload';

const router = express.Router();

router.post('/', verifyToken, authorize('client'), requireConfirmedContact, uploadGigMedia, gigController.createGig);
router.get('/', optionalAuth, gigController.listGigs);
// Before '/:id', which would otherwise swallow it.
router.get('/rates', verifyToken, gigController.rates);
router.post('/:id/invite', verifyToken, authorize('client'), requireConfirmedContact, workerDirectoryController.invite);
router.get('/:id', optionalAuth, gigController.getGig);
router.get('/:id/candidates', verifyToken, gigController.listCandidates);
router.put('/:id', verifyToken, authorize('client'), gigController.updateGig);

export default router;
