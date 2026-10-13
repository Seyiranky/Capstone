import express from 'express';
import * as matchController from '../controllers/matchController';
import * as teamController from '../controllers/teamController';
import { verifyToken } from '../middleware/authMiddleware';
import { MAX_JOB_PHOTOS, uploadJobPhotos } from '../middleware/upload';

const router = express.Router();

router.get('/', verifyToken, matchController.listMatches);
router.put('/:id/status', verifyToken, matchController.updateMatchStatus);
router.post('/:id/complete', verifyToken, matchController.completeWithCode);
router.post('/:id/work-done', verifyToken, matchController.markWorkDone);
router.post('/:id/apprentice', verifyToken, teamController.inviteApprentice);
router.get('/:id/visit', verifyToken, matchController.visitStatus);
router.post('/:id/check-in', verifyToken, matchController.checkIn);
router.post('/:id/check-out', verifyToken, matchController.checkOut);
router.post('/:id/sos', verifyToken, matchController.sos);
router.post('/:id/photos', verifyToken, uploadJobPhotos.array('photos', MAX_JOB_PHOTOS), matchController.addJobPhotos);

export default router;
