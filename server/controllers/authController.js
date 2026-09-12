const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { User } = require('../models');

const SALT_ROUNDS = 10;
const REGISTERABLE_ROLES = ['worker', 'client'];
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

exports.register = async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'name, email, password, and role are required' });
  }
  if (!REGISTERABLE_ROLES.includes(role)) {
    return res.status(400).json({ message: `role must be one of: ${REGISTERABLE_ROLES.join(', ')}` });
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    return res.status(409).json({ message: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ name, email, passwordHash, role });

  const token = signToken(user);
  res.status(201).json({ token, userId: user.id, role: user.role });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  const user = await User.scope('withPassword').findOne({ where: { email } });
  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  if (user.status === 'suspended') {
    return res.status(403).json({ message: 'This account has been suspended. Contact an administrator.' });
  }

  const token = signToken(user);
  res.json({ token, userId: user.id, role: user.role });
};

// Real Google sign-in: the client uses Google Identity Services to obtain a
// signed ID token (a JWT issued and signed by Google, not something the
// client can forge) and posts it here as `credential`. We verify it against
// Google's public keys before trusting the email/name it contains.
//
// New accounts need a role, which Google's token doesn't carry. If the email
// isn't registered yet and no `role` was sent, we respond with `needsRole`
// instead of a token; the client then re-submits the same credential plus a
// chosen role to finish provisioning the account.
exports.googleLogin = async (req, res) => {
  const { credential, role } = req.body;
  if (!credential) {
    return res.status(400).json({ message: 'credential is required' });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ message: 'Invalid Google credential' });
  }

  if (!payload?.email_verified) {
    return res.status(401).json({ message: 'Google account email is not verified' });
  }

  let user = await User.findOne({ where: { email: payload.email } });
  let status = 200;

  if (!user) {
    if (!role) {
      return res.status(200).json({ needsRole: true, name: payload.name, email: payload.email });
    }
    if (!REGISTERABLE_ROLES.includes(role)) {
      return res.status(400).json({ message: `role must be one of: ${REGISTERABLE_ROLES.join(', ')}` });
    }
    // Unusable random hash — this account has no password, only Google sign-in.
    const passwordHash = await bcrypt.hash(crypto.randomUUID(), SALT_ROUNDS);
    user = await User.create({ name: payload.name, email: payload.email, passwordHash, role });
    status = 201;
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ message: 'This account has been suspended. Contact an administrator.' });
  }

  const token = signToken(user);
  res.status(status).json({ token, userId: user.id, role: user.role });
};

// No email service is configured for this project (that would need SMTP or a
// transactional-email API, similar to how Google sign-in needed a real OAuth
// Client ID). Instead of emailing a reset link, we hand the token straight
// back in the response so the client can show/link to it directly — the same
// "simulate what a real integration would do" approach used for payments.
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'email is required' });
  }

  const user = await User.findOne({ where: { email } });
  if (!user) {
    return res.json({ message: 'If that email is registered, a reset link has been generated.' });
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await user.update({ resetToken, resetTokenExpiresAt });

  res.json({ message: 'If that email is registered, a reset link has been generated.', resetToken });
};

exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ message: 'token and password are required' });
  }

  const user = await User.findOne({ where: { resetToken: token } });
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    return res.status(400).json({ message: 'This reset link is invalid or has expired' });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await user.update({ passwordHash, resetToken: null, resetTokenExpiresAt: null });

  res.json({ message: 'Password updated. You can now log in.' });
};
