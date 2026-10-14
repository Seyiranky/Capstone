import express from 'express';
import * as coverController from '../controllers/coverController';
import * as matchController from '../controllers/matchController';
import * as teamController from '../controllers/teamController';
import { verifyToken } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';
import { MAX_JOB_PHOTOS, uploadJobPhotos } from '../middleware/upload';

const router = express.Router();

router.get('/', verifyToken, matchController.listMatches);
router.put('/:id/status', verifyToken, matchController.updateMatchStatus);
router.post('/:id/apprentice', verifyToken, teamController.inviteApprentice);
router.get('/:id/visit', verifyToken, matchController.visitStatus);
router.get('/:id/cover', verifyToken, coverController.status);
router.post('/:id/cover', verifyToken, authorize('client'), coverController.buy);
router.post('/:id/cover-claims', verifyToken, authorize('worker'), coverController.fileClaim);
router.post('/:id/check-in', verifyToken, matchController.checkIn);
router.post('/:id/check-out', verifyToken, matchController.checkOut);
router.post('/:id/sos', verifyToken, matchController.sos);
router.post('/:id/photos', verifyToken, uploadJobPhotos.array('photos', MAX_JOB_PHOTOS), matchController.addJobPhotos);

export default router;
