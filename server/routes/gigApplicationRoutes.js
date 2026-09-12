const express = require('express');
const router = express.Router();
const gigApplicationController = require('../controllers/gigApplicationController');
const { verifyToken } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.post('/', verifyToken, authorize('worker'), gigApplicationController.applyToGig);
router.get('/', verifyToken, gigApplicationController.listApplications);
router.put('/:id/review', verifyToken, authorize('admin'), gigApplicationController.reviewApplication);

module.exports = router;
