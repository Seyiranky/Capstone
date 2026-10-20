import express from 'express';
import * as workerDirectoryController from '../controllers/workerDirectoryController';
import * as userController from '../controllers/userController';
import { verifyToken } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';
import * as passportController from '../controllers/passportController';
import { uploadAvatar } from '../middleware/upload';

const router = express.Router();

router.get('/me', verifyToken, userController.getProfile);
router.put('/me', verifyToken, userController.updateProfile);
router.get('/me/export', verifyToken, userController.exportMyData);
router.get('/me/export.pdf', verifyToken, userController.exportMyDataPdf);
router.post('/me/avatar', verifyToken, uploadAvatar, userController.uploadAvatar);
router.delete('/me/avatar', verifyToken, userController.deleteAvatar);
router.get('/me/deletion-check', verifyToken, userController.deletionCheck);
router.delete('/me', verifyToken, userController.deleteMe);
// Before '/:id', which would otherwise take 'search' as an id.
router.get('/search', verifyToken, userController.searchWorkers);
router.get('/directory', verifyToken, authorize('client', 'admin'), workerDirectoryController.list);
// Distinct from the export above: that is a data dump for the holder, this is
// a signed attestation of earnings intended for a lender.
router.get('/me/income-statement', verifyToken, passportController.incomeStatement);
router.post('/income-statement/verify', passportController.verifyIncomeStatement);
router.get('/:id', verifyToken, userController.getPublicProfile);
router.get('/:id/skills', verifyToken, userController.getUserSkills);
router.get('/:id/work-history', verifyToken, userController.getWorkHistory);

export default router;
