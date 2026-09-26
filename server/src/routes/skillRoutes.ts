import express from 'express';
import * as skillController from '../controllers/skillController';

const router = express.Router();

router.get('/', skillController.listSkills);
router.get('/:id', skillController.getSkill);

export default router;
