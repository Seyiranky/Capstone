const { SurveyResponse } = require('../models');

// Fixed set so the pilot analysis has stable, comparable prompt keys.
const PROMPT_KEYS = [
  'willingnessToHire',
  'matchRelevance',
  'verificationConfidence',
  'easeOfUse',
];

exports.submitResponse = async (req, res) => {
  const { promptKey, value, context } = req.body;

  if (!PROMPT_KEYS.includes(promptKey)) {
    return res.status(400).json({ message: `promptKey must be one of: ${PROMPT_KEYS.join(', ')}` });
  }
  if (!Number.isInteger(value) || value < 1 || value > 7) {
    return res.status(400).json({ message: 'value must be an integer from 1 to 7' });
  }
  if (context !== undefined && (typeof context !== 'object' || context === null || Array.isArray(context))) {
    return res.status(400).json({ message: 'context must be an object' });
  }

  const response = await SurveyResponse.create({
    userId: req.user.id,
    promptKey,
    value,
    context: context || null,
  });

  res.status(201).json(response);
};

exports.listResponses = async (req, res) => {
  const where = req.user.role === 'admin' ? {} : { userId: req.user.id };
  if (req.query.promptKey) {
    where.promptKey = req.query.promptKey;
  }

  const responses = await SurveyResponse.findAll({ where, order: [['createdAt', 'DESC']] });
  res.json(responses);
};
