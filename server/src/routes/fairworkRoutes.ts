import express from 'express';
import * as fairworkController from '../controllers/fairworkController';

const router = express.Router();

// Public on purpose: the scorecard is the platform answering for itself.
router.get('/', fairworkController.scorecard);

export default router;
