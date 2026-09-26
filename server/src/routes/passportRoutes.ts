import express from 'express';
import * as passportController from '../controllers/passportController';
import { verifyToken } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';

const router = express.Router();

// Public by design: the point of a portable credential is that a client can
// check it without holding an account.
router.get('/:token/verify', passportController.verify);
router.get('/:token', passportController.read);

router.post('/', verifyToken, authorize('worker'), passportController.issue);
router.delete('/', verifyToken, authorize('worker'), passportController.revoke);

export default router;
