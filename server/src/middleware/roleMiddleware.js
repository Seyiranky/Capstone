exports.authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
};

/**
 * Gates routes on the reviewer capability rather than on `role`.
 *
 * Peer reviewers are workers, so a role check would exclude them and leave the
 * reviewer pool too small for rotation to mean anything.
 */
exports.requireReviewer = (req, res, next) => {
  if (!req.user?.reviewerTier) {
    return res.status(403).json({ message: 'You are not enrolled as a reviewer' });
  }
  next();
};
