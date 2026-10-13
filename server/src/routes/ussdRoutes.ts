import express from 'express';
import * as ussdController from '../controllers/ussdController';
import { verifyToken } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';

const router = express.Router();

// Gateways post form-encoded bodies, unlike the rest of the API.
router.post('/gateway', express.urlencoded({ extended: false, limit: '10kb' }), ussdController.gateway);
router.post('/simulate', verifyToken, authorize('worker'), ussdController.simulate);

export default router;
