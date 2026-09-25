const passportService = require('../services/passportService');
const incomeStatementService = require('../services/incomeStatementService');

/**
 * Issues a fresh passport, revoking any earlier one.
 *
 * Only one live passport per worker: a stack of valid links would make
 * revocation meaningless if a worker ever needed to withdraw one.
 */
exports.issue = async (req, res) => {
  await passportService.revokeAllFor(req.user.id);
  const issued = await passportService.issue(req.user.id);
  if (!issued) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.status(201).json(issued);
};

exports.revoke = async (req, res) => {
  await passportService.revokeAllFor(req.user.id);
  res.json({ message: 'Passport revoked' });
};

/** Public: a client checking a worker's credential needs no account. */
exports.read = async (req, res) => {
  const result = await passportService.read(req.params.token);
  if (!result.valid) {
    return res.status(404).json(result);
  }
  res.json(result);
};

exports.verify = async (req, res) => {
  const result = await passportService.verify(req.params.token);
  if (!result.valid) {
    return res.status(404).json(result);
  }
  res.json(result);
};

exports.incomeStatement = async (req, res) => {
  const { from, to, format } = req.query;
  if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) {
    return res.status(400).json({ message: 'from and to must be valid dates' });
  }

  const statement = await incomeStatementService.build(req.user.id, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });
  if (!statement) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="isoko-income-statement.csv"');
    return res.send(incomeStatementService.toCsv(statement));
  }

  res.json(statement);
};

exports.verifyIncomeStatement = async (req, res) => {
  const { signature } = req.body;
  if (!signature) {
    return res.status(400).json({ message: 'signature is required' });
  }
  const result = await incomeStatementService.verify(signature);
  if (!result.valid) {
    return res.status(404).json(result);
  }
  res.json(result);
};
