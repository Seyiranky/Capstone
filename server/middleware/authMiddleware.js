const jwt = require('jsonwebtoken');
const { User } = require('../models');

exports.verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = header.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  // Checked on every request (not just at login) so a suspension takes effect
  // immediately for a worker/client who is already mid-session with a valid token.
  const user = await User.findByPk(decoded.id);
  if (!user) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
  if (user.status === 'suspended') {
    return res
      .status(403)
      .json({ message: 'This account has been suspended. Contact an administrator.', code: 'ACCOUNT_SUSPENDED' });
  }

  req.user = decoded;
  next();
};
