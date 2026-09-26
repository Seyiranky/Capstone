import express from 'express';
import * as userController from '../controllers/userController';
import { verifyToken } from '../middleware/authMiddleware';
import * as passportController from '../controllers/passportController';

const router = express.Router();

router.get('/me', verifyToken, userController.getProfile);
router.put('/me', verifyToken, userController.updateProfile);
router.get('/me/export', verifyToken, userController.exportMyData);
// Distinct from the export above: that is a data dump for the holder, this is
// a signed attestation of earnings intended for a lender.
router.get('/me/income-statement', verifyToken, passportController.incomeStatement);
router.post('/income-statement/verify', passportController.verifyIncomeStatement);
router.get('/:id', verifyToken, userController.getPublicProfile);
router.get('/:id/skills', verifyToken, userController.getUserSkills);

export default router;
