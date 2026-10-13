import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type { Request, Response } from 'express';
import { User, userWithPassword } from '../models/User';
import * as email from '../lib/channels/email';
import { authed } from '../lib/authed';
import * as allocationService from '../services/allocationService';
import { jwtExpiresIn, jwtSecret } from '../config/env';
import type { ExperimentArm, Role } from '../types/domain';

const SALT_ROUNDS = 10;
const REGISTERABLE_ROLES: Role[] = ['worker', 'client'];
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/** Emails are matched case-insensitively: stored and looked up in lower case. */
const normalEmail = (raw: unknown) => String(raw ?? '').trim().toLowerCase();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD_LENGTH = 8;

/** Reset links are stored hashed, so a database leak does not hand out working links. */
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const signToken = (user: User) =>
  jwt.sign({ id: user.id, role: user.role }, jwtSecret(), {
    algorithm: 'HS256',
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
  const { password, role } = req.body ?? {};
  const name = String(req.body?.name ?? '').trim();
  const email = normalEmail(req.body?.email);

  if (!name || !email || !password || !role) {
    res.status(400).json({ message: 'name, email, password, and role are required' });
    return;
  }
  if (name.length > 80) {
    res.status(400).json({ message: 'Name must be at most 80 characters' });
    return;
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    res.status(400).json({ message: 'Enter a valid email address' });
    return;
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > 128) {
    res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
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
  const { password } = req.body ?? {};
  const email = normalEmail(req.body?.email);
  if (!email || typeof password !== 'string' || !password) {
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

  let user = await User.findOne({ where: { email: normalEmail(payload.email) } });
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
      email: normalEmail(payload.email),
      passwordHash,
      role,
      // Google asserted email_verified above, which is checked before we get
      // here. Asking this user to confirm an address Google already confirmed
      // would be theatre, so record it and move on.
      emailVerifiedAt: new Date(),
    });
    status = 201;
  } else if (!user.emailVerifiedAt) {
    // An account that registered with a password and later signed in with
    // Google: the same proof applies, so stop treating the address as unproven.
    await user.update({ emailVerifiedAt: new Date() });
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

// Emails a one-time link to reset the password. With EMAIL_DRIVER=log (the
// default in development) the email, link included, is printed in the server
// log instead of sent.
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const address = normalEmail(req.body?.email);
  if (!address) {
    res.status(400).json({ message: 'email is required' });
    return;
  }

  // The same answer whether or not the address has an account, so this form
  // cannot be used to find out who is registered. The link goes only to the
  // inbox; it is never returned in the response, which would let anyone who
  // knows an address take over the account.
  const answer = { message: 'If that email is registered, we have sent a link to reset the password.' };
  const user = await User.findOne({ where: { email: address } });
  if (!user || user.status === 'suspended') {
    res.json(answer);
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  await user.update({ resetToken: hashToken(token), resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000) });

  const link = `${email.appUrl()}/reset-password?token=${token}`;
  try {
    await email.send({
      to: user.email,
      subject: 'Reset your Isoko Talents password',
      text: `Someone asked to reset the password for this account.\n\n${link}\n\nThe link works for one hour, once. If it was not you, ignore this email and your password stays the same.`,
      html: `<p>Someone asked to reset the password for this account.</p><p><a href="${link}">Choose a new password</a></p><p style="color:#71717a;font-size:13px">The link works for one hour, once. If it was not you, ignore this email and your password stays the same.</p>`,
    });
  } catch (err) {
    console.error('Password reset email failed', err);
  }
  res.json(answer);
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body ?? {};
  if (!token || !password) {
    res.status(400).json({ message: 'token and password are required' });
    return;
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > 128) {
    res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }

  const user = await User.findOne({ where: { resetToken: hashToken(String(token)) } });
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    res.status(400).json({ message: 'This reset link is invalid or has expired' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await user.update({ passwordHash, passwordChangedAt: new Date(), resetToken: null, resetTokenExpiresAt: null });

  res.json({ message: 'Password updated. You can now log in.' });
};

/**
 * Changes the password of the signed-in user, who must give the current one.
 * Every other session is signed out; this one gets a fresh token.
 */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword) {
    res.status(400).json({ message: 'currentPassword and newPassword are required' });
    return;
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > 128) {
    res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }
  const user = await userWithPassword().findByPk(authed(req).id);
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    res.status(401).json({ message: 'Your current password is not right' });
    return;
  }
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    res.status(400).json({ message: 'Choose a password you have not used here' });
    return;
  }
  // A second back, so the token issued below is not refused as older than the change.
  await user.update({
    passwordHash: await bcrypt.hash(newPassword, SALT_ROUNDS),
    passwordChangedAt: new Date(Math.floor(Date.now() / 1000) * 1000 - 1000),
  });
  res.json({ message: 'Password changed. Other devices have been signed out.', token: signToken(user) });
};

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_RESEND_COOLDOWN_MS = 2 * 60 * 1000;

/**
 * Mails a link that confirms the caller owns the address on their account.
 *
 * Deliberately not modelled as a notification. A notification is something the
 * recipient opted into a channel for, and this is the message that establishes
 * whether that channel can be used at all -- so it goes straight to the email
 * channel and is sent whatever the user's preference says.
 *
 * Unlike forgotPassword, the token is never in the response. That endpoint
 * returns it because no mailer existed when it was written, which means anyone
 * who knows an address can obtain a working reset token; it is a hole to close,
 * not a pattern to copy. On the `log` driver the link is printed by the server,
 * which is how this is demonstrated without a mail account.
 */
export const sendVerificationEmail = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const user = await User.findByPk(caller.id);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  if (user.emailVerifiedAt) {
    res.json({ message: 'This address is already confirmed.', verified: true });
    return;
  }

  // The expiry doubles as the record of when the last link was sent, so a
  // cooldown needs no extra column. Without it this endpoint will mail an
  // arbitrary address as fast as it is called.
  if (user.emailVerificationExpiresAt) {
    const sentAt = user.emailVerificationExpiresAt.getTime() - VERIFICATION_TTL_MS;
    const waited = Date.now() - sentAt;
    if (waited < VERIFICATION_RESEND_COOLDOWN_MS) {
      const retryAfter = Math.ceil((VERIFICATION_RESEND_COOLDOWN_MS - waited) / 1000);
      res.status(429).json({
        message: `A link was just sent. Try again in ${retryAfter} seconds.`,
        retryAfter,
      });
      return;
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  await user.update({
    emailVerificationToken: token,
    emailVerificationExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
  });

  const link = `${email.appUrl()}/verify-email?token=${token}`;
  const body = `Confirm this address to start receiving Isoko Talents notifications by email.\n\n${link}\n\nThe link works for 24 hours. If you did not ask for this, ignore it.`;

  try {
    await email.send({ to: user.email, ...email.render('Confirm your email address', body) });
  } catch (error) {
    // Surfaced rather than swallowed: the user is waiting on a link, and
    // reporting success while nothing was sent leaves them stuck with no clue.
    res.status(502).json({
      message: 'Could not send the confirmation email. Try again shortly.',
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  res.json({ message: 'Check your inbox for a confirmation link.' });
};

/**
 * Confirms an address from the token in the emailed link.
 *
 * Public, because the link is followed from a mail client where the user may
 * not be signed in. The token is the proof -- 32 random bytes, single use, and
 * cleared on success so a forwarded email cannot be replayed.
 */
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  const { token } = req.body ?? {};
  if (!token || typeof token !== 'string') {
    res.status(400).json({ message: 'token is required' });
    return;
  }

  const user = await User.findOne({ where: { emailVerificationToken: token } });
  if (!user || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
    res.status(400).json({ message: 'This confirmation link is invalid or has expired' });
    return;
  }

  await user.update({
    emailVerifiedAt: new Date(),
    emailVerificationToken: null,
    emailVerificationExpiresAt: null,
  });

  res.json({ message: 'Email address confirmed. You can now receive notifications by email.' });
};
