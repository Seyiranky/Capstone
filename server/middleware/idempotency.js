const { IdempotencyKey } = require('../models');

/**
 * Makes a repeated request produce one effect and one answer.
 *
 * Two callers need this for the same reason. A payment provider retries a
 * webhook when it does not see a prompt 200. A phone replays an action it
 * queued while offline, sometimes after the first attempt already succeeded
 * but its response was lost. In both cases the second arrival must not create
 * a second effect, and must receive what the first attempt returned rather
 * than a fresh, differently-shaped success.
 *
 * The key is claimed by a unique insert, so two simultaneous arrivals race at
 * the database rather than in application code: exactly one wins and proceeds,
 * the other is told to wait.
 */
const idempotent = (scope) => async (req, res, next) => {
  const key = req.get('Idempotency-Key') || req.body?.clientRequestId;
  if (!key) return next();

  const existing = await IdempotencyKey.findOne({ where: { scope, key } });
  if (existing?.completedAt) {
    return res
      .status(existing.statusCode ?? 200)
      .json({ ...(existing.responseBody ?? {}), replayed: true });
  }
  if (existing) {
    // Claimed but unfinished: the first attempt is still running. Asking the
    // caller to retry is safer than running the work a second time.
    return res.status(409).json({ message: 'This request is already being processed' });
  }

  let claim;
  try {
    claim = await IdempotencyKey.create({ scope, key });
  } catch {
    // Lost the race to insert, so another request holds the claim.
    return res.status(409).json({ message: 'This request is already being processed' });
  }

  // Record the outcome *before* the response leaves, not after. Recording
  // afterwards leaves a window in which a retry arriving immediately sees a
  // claim that is taken but not yet complete, and gets told to try again —
  // which is exactly the case the key exists to handle. Providers retry fast.
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400) {
      return originalJson(body);
    }
    claim
      .update({ statusCode: res.statusCode, responseBody: body, completedAt: new Date() })
      .then(() => originalJson(body))
      .catch(() => originalJson(body));
    return res;
  };

  // A failed attempt must not be remembered as done, or a legitimate retry
  // would replay an error forever.
  res.on('finish', async () => {
    if (res.statusCode >= 400) {
      await claim.destroy().catch(() => {});
    }
  });

  next();
};

module.exports = { idempotent };
