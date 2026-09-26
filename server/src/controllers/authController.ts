import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type { Request, Response } from 'express';
import { User, userWithPassword } from '../models/User';
import * as allocationService from '../services/allocationService';
import { jwtExpiresIn, jwtSecret } from '../config/env';
import type { ExperimentArm, Role } from '../types/domain';

const SALT_ROUNDS = 10;
const REGISTERABLE_ROLES: Role[] = ['worker', 'client'];
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const signToken = (user: User) =>
  jwt.sign({ id: user.id, role: user.role }, jwtSecret(), {
    expiresIn: jwtExpiresIn(),
  } as jwt.SignOptions);

/**
 * Takes the next arm from the pre-generated randomisation list.
 *
 * RQ3 asks whether structured, verified skill-proof raises a client's
 * willingness to hire a stranger, which needs clients who see how each claim
 * was established and clients who see only verified-or-not. Assignment happens
 * at registration because an arm added later cannot describe the decisions
 * already made without it.
 *
 * The sequence is fixed before recruitment rather than decided here. Two
 * earlier attempts were worse: an independent coin flip produced a 7-1 split
 * across eight registrations in testing, which would gut a comparison of this
 * size; strict alternation fixed the balance but made every assignment
 * predictable, and in a pilot where the researcher personally registers
 * participants in person, a predictable arm is an invitation to select who
 * enrols next. A permuted-block list claimed atomically keeps the balance
 * without telling anyone what is coming.
 *
 * Returns null when the list runs out, rather than inventing an arm: an
 * unallocated client is honest data, a fabricated one is not.
 *
 * Workers are unassigned — they see their own provenance either way.
 */
const assignExperimentArm = async (
  role: Role,
  userId: string,
): Promise<ExperimentArm | null> => {
  if (role !== 'client') return null;
  return allocationService.claimArm(userId);
};

export const register = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, role } = req.body ?? {};

  if (!name || !email || !password || !role) {
    res.status(400).json({ message: 'name, email, password, and role are required' });
    return;
  }
  if (!REGISTERABLE_ROLES.includes(role)) {
    res.status(400).json({ message: `role must be one of: ${REGISTERABLE_ROLES.join(', ')}` });
    return;
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    res.status(409).json({ message: 'Email already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ name, email, passwordHash, role });

  const arm = await assignExperimentArm(role, user.id);
  if (arm) {
    await user.update({ experimentArm: arm });
  }

  const token = signToken(user);
  res.status(201).json({ token, userId: user.id, role: user.role });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ message: 'email and password are required' });
    return;
  }

  // The only place the password hash is read, so the only place the
  // withPassword scope is needed — defaultScope strips it everywhere else.
  const user = await userWithPassword().findOne({ where: { email } });
  if (!user) {
    res.status(401).json({ message: 'Invalid email or password' });
    return;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    res.status(401).json({ message: 'Invalid email or password' });
    return;
  }
  if (user.status === 'suspended') {
    res
      .status(403)
      .json({ message: 'This account has been suspended. Contact an administrator.' });
    return;
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
export const googleLogin = async (req: Request, res: Response): Promise<void> => {
  const { credential, role } = req.body ?? {};
  if (!credential) {
    res.status(400).json({ message: 'credential is required' });
    return;
  }

  let payload: TokenPayload | undefined;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    res.status(401).json({ message: 'Invalid Google credential' });
    return;
  }

  if (!payload?.email_verified) {
    res.status(401).json({ message: 'Google account email is not verified' });
    return;
  }

  let user = await User.findOne({ where: { email: payload.email } });
  let status = 200;

  if (!user) {
    if (!role) {
      res.status(200).json({ needsRole: true, name: payload.name, email: payload.email });
      return;
    }
    if (!REGISTERABLE_ROLES.includes(role)) {
      res.status(400).json({ message: `role must be one of: ${REGISTERABLE_ROLES.join(', ')}` });
      return;
    }
    // Unusable random hash — this account has no password, only Google sign-in.
    const passwordHash = await bcrypt.hash(crypto.randomUUID(), SALT_ROUNDS);
    user = await User.create({
      name: payload.name as string,
      email: payload.email as string,
      passwordHash,
      role,
    });
    status = 201;
  }

  if (user.status === 'suspended') {
    res
      .status(403)
      .json({ message: 'This account has been suspended. Contact an administrator.' });
    return;
  }

  const token = signToken(user);
  res.status(status).json({ token, userId: user.id, role: user.role });
};

// No email service is configured for this project (that would need SMTP or a
// transactional-email API, similar to how Google sign-in needed a real OAuth
// Client ID). Instead of emailing a reset link, we hand the token straight
// back in the response so the client can show/link to it directly — the same
// "simulate what a real integration would do" approach used for payments.
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email) {
    res.status(400).json({ message: 'email is required' });
    return;
  }

  const user = await User.findOne({ where: { email } });
  if (!user) {
    res.json({ message: 'If that email is registered, a reset link has been generated.' });
    return;
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await user.update({ resetToken, resetTokenExpiresAt });

  res.json({
    message: 'If that email is registered, a reset link has been generated.',
    resetToken,
  });
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body ?? {};
  if (!token || !password) {
    res.status(400).json({ message: 'token and password are required' });
    return;
  }

  const user = await User.findOne({ where: { resetToken: token } });
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    res.status(400).json({ message: 'This reset link is invalid or has expired' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await user.update({ passwordHash, resetToken: null, resetTokenExpiresAt: null });

  res.json({ message: 'Password updated. You can now log in.' });
};
