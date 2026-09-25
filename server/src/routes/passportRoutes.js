const express = require('express');
const router = express.Router();
const passportController = require('../controllers/passportController');
const { verifyToken } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// Public by design: the point of a portable credential is that a client can
// check it without holding an account.
router.get('/:token/verify', passportController.verify);
router.get('/:token', passportController.read);

router.post('/', verifyToken, authorize('worker'), passportController.issue);
router.delete('/', verifyToken, authorize('worker'), passportController.revoke);

module.exports = router;
