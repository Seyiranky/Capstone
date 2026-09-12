const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/initiate', verifyToken, transactionController.initiateTransaction);
router.post('/:id/confirm', verifyToken, transactionController.confirmTransaction);
router.get('/', verifyToken, transactionController.listTransactions);

module.exports = router;
