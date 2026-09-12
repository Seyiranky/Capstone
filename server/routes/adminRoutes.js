const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.get('/users', verifyToken, authorize('admin'), adminController.listUsers);
router.get('/gigs', verifyToken, authorize('admin'), adminController.listGigs);
router.get('/flagged', verifyToken, authorize('admin'), adminController.listFlagged);
router.get('/metrics', verifyToken, authorize('admin'), adminController.pilotMetrics);
router.get('/reviewers', verifyToken, authorize('admin'), adminController.listReviewers);
router.put('/users/:id/reviewer-tier', verifyToken, authorize('admin'), adminController.setReviewerTier);
router.put('/gigs/:id/review', verifyToken, authorize('admin'), adminController.reviewGig);
router.put('/users/:id/moderate', verifyToken, authorize('admin'), adminController.moderateUser);
router.delete('/users/:id', verifyToken, authorize('admin'), adminController.deleteUser);

module.exports = router;
