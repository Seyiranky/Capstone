import crypto from 'crypto';
import fs from 'fs';
import type { Request } from 'express';
import { Op } from 'sequelize';
import {
  Gig,
  Match,
  Report,
  SkillTask,
  Skill,
  SupportMessage,
  SupportSavedReply,
  SupportTicket,
  Transaction,
  User,
} from '../models';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_RELATED,
  SUPPORT_STATUSES,
  type SupportCategory,
  type SupportContext,
  type SupportPriority,
  type SupportRelatedType,
  type SupportStatus,
} from '../models/SupportTicket';
import type { SupportAuthorRole } from '../models/SupportMessage';
import { HttpError } from '../lib/httpError';
import { requireEnv } from '../config/env';
import { secretMatches } from '../lib/secrets';
import { signUpload } from '../lib/signedUploads';
import { looksLikeImageOrPdf } from '../middleware/upload';
import notify from '../lib/notify';
import * as email from '../lib/channels/email';
import * as disputeService from './disputeService';

type Ctx = Pick<Request, 'app'> | undefined;

export const SUBJECT_MAX = 140;
export const BODY_MAX = 4000;
/** Requests a person may have open at once, and start in a day. */
export const MAX_OPEN = 5;
export const MAX_PER_DAY = 10;
/** A resolved request nobody replies to closes after this long. */
export const AUTO_CLOSE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** A reference people can read out on the phone, e.g. SUP-7KQ2-M9XD. */
const newNumber = () => {
  const chars = [...crypto.randomBytes(8)].map((b) => ALPHABET[b % 32]).join('');
  return `SUP-${chars.slice(0, 4)}-${chars.slice(4)}`;
};
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const signingSecret = () => process.env.SUPPORT_LINK_SECRET || requireEnv('JWT_SECRET');
/**
 * The private link for a signed-out person's request: the ticket id and a
 * signature over it. Nothing secret is stored, so every email can carry the
 * same link, and it cannot be guessed or altered to reach another request.
 */
export const guestToken = (ticketId: string) =>
  `${ticketId}.${crypto.createHmac('sha256', signingSecret()).update(`support:${ticketId}`).digest('base64url')}`;

/** Safety comes first; money next; everything else in turn. */
const PRIORITY_FOR: Record<SupportCategory, SupportPriority> = {
  safety: 'urgent',
  payment: 'high',
  account: 'normal',
  skills: 'normal',
  job: 'normal',
  bug: 'normal',
  other: 'low',
};

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const cleanContext = (raw: unknown): SupportContext | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ctx: SupportContext = {
    path: clean(r.path, 200) || undefined,
    userAgent: clean(r.userAgent, 300) || undefined,
    language: clean(r.language, 10) || undefined,
    screen: clean(r.screen, 20) || undefined,
  };
  return Object.values(ctx).some(Boolean) ? ctx : null;
};

/** Keeps an uploaded file only if it really is an image or a PDF. */
const acceptFile = (file: Express.Multer.File | undefined) => {
  if (!file) return null;
  if (!looksLikeImageOrPdf(file.path)) {
    fs.rm(file.path, { force: true }, () => undefined);
    throw new HttpError('That file is not a picture or a PDF', 400);
  }
  return {
    attachmentUrl: `/uploads/support/${file.filename}`,
    attachmentMime: file.mimetype,
    attachmentName: file.originalname.replace(/[^\w.\- ]+/g, '').slice(0, 80) || 'attachment',
  };
};

const discard = (file: Express.Multer.File | undefined) => {
  if (file) fs.rm(file.path, { force: true }, () => undefined);
};

// ── What a ticket is about ───────────────────────────────────────────────────

/** Checks the person may attach this job, payment or skill submission. */
const ownsRelated = async (userId: string, type: SupportRelatedType, id: string): Promise<boolean> => {
  if (type === 'skill_task') return Boolean(await SkillTask.count({ where: { id, workerId: userId } }));
  const matchId = type === 'transaction' ? (await Transaction.findByPk(id, { attributes: ['matchId'] }))?.matchId : id;
  if (!matchId) return false;
  const match = await Match.findByPk(matchId, { include: [{ model: Gig, as: 'gig', attributes: ['clientId'] }] });
  return Boolean(match && (match.workerId === userId || (match as Match & { gig?: Gig }).gig?.clientId === userId));
};

export interface RelatedSummary {
  type: SupportRelatedType;
  id: string;
  title: string;
  detail: string | null;
  status: string | null;
  matchId: string | null;
  gigId: string | null;
}

export const relatedSummary = async (type: string | null, id: string | null): Promise<RelatedSummary | null> => {
  if (!type || !id) return null;
  if (type === 'skill_task') {
    const task = await SkillTask.findByPk(id, { include: [{ model: Skill, as: 'skill' }] });
    if (!task) return null;
    return { type, id, title: task.skill?.name ?? 'Skill submission', detail: task.kind, status: task.status, matchId: null, gigId: null };
  }
  const tx = type === 'transaction' ? await Transaction.findByPk(id) : null;
  const matchId = tx ? tx.matchId : id;
  const match = await Match.findByPk(matchId, {
    include: [
      { model: Gig, as: 'gig', include: [{ model: User, as: 'client' }] },
      { model: User, as: 'worker' },
    ],
  });
  if (!match) return null;
  const gig = (match as Match & { gig?: Gig & { client?: User } }).gig;
  const worker = (match as Match & { worker?: User }).worker;
  if (tx) {
    return {
      type: 'transaction',
      id,
      title: `Payment for "${gig?.title ?? 'a job'}"`,
      detail: `${Math.round(Number(tx.amount)).toLocaleString('en-US')} RWF · ${tx.receiptNumber ?? tx.reference}`,
      status: tx.status,
      matchId,
      gigId: gig?.id ?? null,
    };
  }
  return {
    type: 'match',
    id,
    title: gig?.title ?? 'A job',
    detail: `${worker?.name ?? 'Worker'} for ${gig?.client?.name ?? 'client'}`,
    status: match.status,
    matchId,
    gigId: gig?.id ?? null,
  };
};

/** The jobs, payments and skill submissions a person can attach to a request. */
export const linkableFor = async (userId: string) => {
  const [asWorker, asClient, tasks] = await Promise.all([
    Match.findAll({ where: { workerId: userId }, include: [{ model: Gig, as: 'gig' }], order: [['createdAt', 'DESC']], limit: 20 }),
    Match.findAll({
      include: [{ model: Gig, as: 'gig', where: { clientId: userId }, required: true }],
      order: [['createdAt', 'DESC']],
      limit: 20,
    }),
    SkillTask.findAll({ where: { workerId: userId }, include: [{ model: Skill, as: 'skill' }], order: [['createdAt', 'DESC']], limit: 10 }),
  ]);
  const matches = [...asWorker, ...asClient] as (Match & { gig?: Gig })[];
  const txs = matches.length ? await Transaction.findAll({ where: { matchId: matches.map((m) => m.id) } }) : [];
  const titleOf = new Map(matches.map((m) => [m.id, m.gig?.title ?? 'A job']));
  return {
    jobs: matches.map((m) => ({ id: m.id, title: m.gig?.title ?? 'A job', status: m.status, createdAt: m.createdAt })),
    payments: txs.map((t) => ({
      id: t.id,
      title: titleOf.get(t.matchId) ?? 'A job',
      amount: Number(t.amount),
      status: t.status,
      receiptNumber: t.receiptNumber,
      createdAt: t.createdAt,
    })),
    skills: tasks.map((s) => ({ id: s.id, title: s.skill?.name ?? 'Skill', status: s.status, createdAt: s.createdAt })),
  };
};

// ── Thread ───────────────────────────────────────────────────────────────────

const system = (ticketId: string, systemKey: string, meta: Record<string, unknown> | null = null, internal = false) =>
  SupportMessage.create({ ticketId, authorId: null, authorRole: 'system', body: '', systemKey, meta, internal });

/** The thread as one side sees it: internal notes only for admins, attachments signed. */
export const thread = async (ticketId: string, viewer: 'requester' | 'admin') => {
  const messages = await SupportMessage.findAll({
    where: { ticketId, ...(viewer === 'requester' ? { internal: false } : {}) },
    include: [{ model: User, as: 'author', attributes: ['id', 'name', 'avatarUrl', 'role'] }],
    order: [['createdAt', 'ASC']],
  });
  return messages.map((m) => {
    const plain = m.get({ plain: true }) as Record<string, unknown> & { author?: { name: string; role: string } | null };
    // The person sees "Isoko Support", not which admin answered.
    if (viewer === 'requester' && m.authorRole === 'admin') plain.author = null;
    return { ...plain, attachmentUrl: signUpload(m.attachmentUrl) };
  });
};

/** Who is told when the person writes: the assignee if there is one, otherwise every admin. */
const tellAdmins = async (ctx: Ctx, ticket: SupportTicket, title: string, body: string) => {
  const ids = ticket.assigneeId
    ? [ticket.assigneeId]
    : (await User.findAll({ where: { role: 'admin' }, attributes: ['id'] })).map((a) => a.id);
  for (const userId of ids) {
    await notify(ctx, { userId, title, body, category: ticket.priority === 'urgent' ? 'critical' : 'activity' });
  }
};

const guestLink = (token: string) => `${email.appUrl()}/support/t/${token}`;

const emailGuest = async (to: string, subject: string, text: string, link: string) => {
  try {
    await email.send({
      to,
      subject,
      text: `${text}\n\n${link}\n\nKeep this link private: anyone with it can read and answer this request.`,
      html:
        `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>` +
        `<p><a href="${link}">Open your request</a></p>` +
        '<p style="color:#71717a;font-size:13px">Keep this link private: anyone with it can read and answer this request.</p>',
    });
  } catch {
    /* the ticket stands even if the email could not be sent; admins can see it */
  }
};

// ── People ───────────────────────────────────────────────────────────────────

export interface NewTicket {
  category: unknown;
  subject: unknown;
  body: unknown;
  relatedType?: unknown;
  relatedId?: unknown;
  context?: unknown;
}

const validated = (input: NewTicket) => {
  const category = String(input.category ?? '') as SupportCategory;
  if (!SUPPORT_CATEGORIES.includes(category)) throw new HttpError('Choose what your request is about', 400);
  const body = clean(input.body, BODY_MAX);
  if (body.length < 10) throw new HttpError('Tell us a little more: at least a sentence', 400);
  const subject = clean(input.subject, SUBJECT_MAX) || body.split(/[.\n]/)[0].slice(0, 80);
  return { category, body, subject };
};

/** A signed-in person asks for help. */
export const create = async (ctx: Ctx, userId: string, input: NewTicket, file?: Express.Multer.File) => {
  try {
    const { category, body, subject } = validated(input);
    const open = await SupportTicket.count({ where: { userId, status: ['open', 'waiting_on_user'] } });
    if (open >= MAX_OPEN) {
      throw new HttpError(`You already have ${MAX_OPEN} open requests. Reply in one of them, or close one you no longer need.`, 429);
    }
    const today = await SupportTicket.count({ where: { userId, createdAt: { [Op.gte]: new Date(Date.now() - 86_400_000) } } });
    if (today >= MAX_PER_DAY) throw new HttpError('You have started a lot of requests today. Try again tomorrow.', 429);

    let relatedType: SupportRelatedType | null = null;
    let relatedId: string | null = null;
    if (input.relatedType && input.relatedId) {
      const type = String(input.relatedType) as SupportRelatedType;
      const id = String(input.relatedId);
      if (!SUPPORT_RELATED.includes(type) || !(await ownsRelated(userId, type, id).catch(() => false))) {
        throw new HttpError('You can only attach your own jobs, payments and skill submissions', 400);
      }
      relatedType = type;
      relatedId = id;
    }
    const attachment = acceptFile(file);
    const now = new Date();
    const ticket = await SupportTicket.create({
      number: newNumber(),
      userId,
      category,
      subject,
      priority: PRIORITY_FOR[category],
      relatedType,
      relatedId,
      context: cleanContext(typeof input.context === 'string' ? safeJson(input.context) : input.context),
      lastMessageAt: now,
    });
    await SupportMessage.create({ ticketId: ticket.id, authorId: userId, authorRole: 'user', body, ...(attachment ?? {}) });
    await system(ticket.id, 'received', { number: ticket.number });

    const user = await User.findByPk(userId, { attributes: ['name'] });
    await tellAdmins(ctx, ticket, ticket.priority === 'urgent' ? 'Urgent support request' : 'New support request', `${user?.name ?? 'Someone'}: ${subject}`);
    return ticket;
  } catch (err) {
    discard(file);
    throw err;
  }
};

const safeJson = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

/** Someone who cannot sign in asks for help; they follow it by a private link sent by email. */
export const createGuest = async (
  ctx: Ctx,
  input: NewTicket & { name: unknown; email: unknown },
): Promise<{ number: string; token: string }> => {
  const { category, body, subject } = validated(input);
  const name = clean(input.name, 80);
  const address = clean(input.email, 160).toLowerCase();
  if (!name) throw new HttpError('Tell us your name', 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new HttpError('Enter an email address we can reply to', 400);
  const today = await SupportTicket.count({
    where: { guestEmail: address, createdAt: { [Op.gte]: new Date(Date.now() - 86_400_000) } },
  });
  if (today >= 3) throw new HttpError('We already have requests from this address today. We will reply by email.', 429);

  const ticket = await SupportTicket.create({
    number: newNumber(),
    userId: null,
    guestName: name,
    guestEmail: address,
    category,
    subject,
    priority: PRIORITY_FOR[category],
    context: cleanContext(input.context),
    lastMessageAt: new Date(),
  });
  const token = guestToken(ticket.id);
  // Kept so a request can be found by its link without trusting the id alone.
  await ticket.update({ guestTokenHash: hashToken(token) });
  await SupportMessage.create({ ticketId: ticket.id, authorId: null, authorRole: 'guest', body });
  await system(ticket.id, 'received', { number: ticket.number });
  await emailGuest(
    address,
    `We received your request ${ticket.number}`,
    `Hello ${name},\n\nThank you for contacting Isoko support. Your reference is ${ticket.number}. We usually reply within a day, and you can follow and answer your request here:`,
    guestLink(token),
  );
  await tellAdmins(ctx, ticket, 'New support request', `${name} (not signed in): ${subject}`);
  return { number: ticket.number, token };
};

export const findByGuestToken = async (token: string) => {
  const [id] = String(token ?? '').split('.');
  if (!/^[0-9a-f-]{36}$/.test(id) || !secretMatches(token, guestToken(id))) return null;
  return SupportTicket.findOne({ where: { id, userId: null } });
};

/** The person who asked writes again. A resolved request opens again; a closed one stays closed. */
export const reply = async (
  ctx: Ctx,
  ticket: SupportTicket,
  author: { id: string | null; role: Extract<SupportAuthorRole, 'user' | 'guest'>; name: string },
  input: { body: unknown },
  file?: Express.Multer.File,
) => {
  try {
    if (ticket.status === 'closed') throw new HttpError('This request is closed. Start a new one if you still need help.', 409);
    const body = clean(input.body, BODY_MAX);
    const attachment = acceptFile(file);
    if (!body && !attachment) throw new HttpError('Write a message or attach a file', 400);
    const message = await SupportMessage.create({ ticketId: ticket.id, authorId: author.id, authorRole: author.role, body, ...(attachment ?? {}) });
    const reopened = ticket.status !== 'open';
    if (reopened) await system(ticket.id, 'reopened');
    await ticket.update({ status: 'open', adminUnread: true, lastMessageAt: new Date(), resolvedAt: null });
    await tellAdmins(ctx, ticket, 'Support request updated', `${author.name} replied: ${ticket.subject}`);
    return message;
  } catch (err) {
    discard(file);
    throw err;
  }
};

export const close = async (ticket: SupportTicket) => {
  if (ticket.status === 'closed') return ticket;
  await system(ticket.id, 'closed_by_user');
  return ticket.update({ status: 'closed', closedAt: new Date(), resolvedAt: ticket.resolvedAt ?? new Date() });
};

export const rate = async (ticket: SupportTicket, helpful: unknown, comment: unknown) => {
  if (ticket.status !== 'resolved' && ticket.status !== 'closed') throw new HttpError('You can rate a request once it is resolved', 409);
  if (typeof helpful !== 'boolean') throw new HttpError('Say whether it helped', 400);
  await ticket.update({ helpful, ratingComment: clean(comment, 500) || null });
  // "No, it did not help" on a resolved request puts it back in the queue.
  if (!helpful && ticket.status === 'resolved') {
    await system(ticket.id, 'not_helpful');
    await ticket.update({ status: 'open', adminUnread: true, resolvedAt: null, lastMessageAt: new Date() });
  }
  return ticket;
};

// ── Admins ───────────────────────────────────────────────────────────────────

/** The team answers, or writes a note only admins see. */
export const adminReply = async (
  ctx: Ctx,
  ticket: SupportTicket,
  admin: User,
  input: { body: unknown; internal?: unknown; status?: unknown; savedReplyId?: unknown },
  file?: Express.Multer.File,
) => {
  try {
    const body = clean(input.body, BODY_MAX);
    const internal = input.internal === true || input.internal === 'true';
    const attachment = acceptFile(file);
    if (!body && !attachment) throw new HttpError('Write a message or attach a file', 400);
    if (ticket.status === 'closed' && !internal) throw new HttpError('This request is closed', 409);

    const message = await SupportMessage.create({
      ticketId: ticket.id,
      authorId: admin.id,
      authorRole: 'admin',
      body,
      internal,
      ...(attachment ?? {}),
    });
    if (input.savedReplyId) {
      await SupportSavedReply.increment('usageCount', { where: { id: String(input.savedReplyId) } }).catch(() => undefined);
    }
    if (internal) {
      await ticket.update({ adminUnread: false });
      return message;
    }

    // A reply asks the person something unless the admin says it settles it.
    const next: SupportStatus = input.status === 'resolved' ? 'resolved' : 'waiting_on_user';
    const now = new Date();
    await ticket.update({
      status: next,
      userUnread: true,
      adminUnread: false,
      lastMessageAt: now,
      firstResponseAt: ticket.firstResponseAt ?? now,
      assigneeId: ticket.assigneeId ?? admin.id,
      ...(next === 'resolved' ? { resolvedAt: now } : {}),
    });
    if (next === 'resolved') await system(ticket.id, 'resolved');
    await tellRequester(ctx, ticket, body);
    return message;
  } catch (err) {
    discard(file);
    throw err;
  }
};

const tellRequester = async (ctx: Ctx, ticket: SupportTicket, excerpt: string) => {
  const short = excerpt.length > 140 ? `${excerpt.slice(0, 137)}…` : excerpt;
  if (ticket.userId) {
    await notify(ctx, {
      userId: ticket.userId,
      title: ticket.status === 'resolved' ? 'Support resolved your request' : 'Support replied',
      body: `${ticket.subject}: ${short}`,
      category: 'outcome',
    });
  } else if (ticket.guestEmail) {
    const token = guestToken(ticket.id);
    await emailGuest(
      ticket.guestEmail,
      `Isoko support replied: ${ticket.number}`,
      `Hello ${ticket.guestName ?? ''},\n\n${excerpt}\n\nTo reply, or to see the whole conversation, open your request:`,
      guestLink(token),
    );
  }
};

/** Status, priority, assignee or category, each change recorded in the thread. */
export const update = async (ticket: SupportTicket, admin: User, input: Record<string, unknown>) => {
  const changes: Partial<SupportTicket> = {};
  const now = new Date();
  if (input.status !== undefined) {
    const status = String(input.status) as SupportStatus;
    if (!SUPPORT_STATUSES.includes(status)) throw new HttpError('Unknown status', 400);
    if (status !== ticket.status) {
      changes.status = status;
      if (status === 'resolved') changes.resolvedAt = now;
      if (status === 'closed') changes.closedAt = now;
      if (status === 'open') Object.assign(changes, { resolvedAt: null, closedAt: null });
      await system(ticket.id, `status_${status}`, { by: admin.name }, status === 'open');
    }
  }
  if (input.priority !== undefined) {
    const priority = String(input.priority) as SupportPriority;
    if (!SUPPORT_PRIORITIES.includes(priority)) throw new HttpError('Unknown priority', 400);
    if (priority !== ticket.priority) {
      changes.priority = priority;
      await system(ticket.id, 'priority', { priority, by: admin.name }, true);
    }
  }
  if (input.category !== undefined) {
    const category = String(input.category) as SupportCategory;
    if (!SUPPORT_CATEGORIES.includes(category)) throw new HttpError('Unknown category', 400);
    changes.category = category;
  }
  if (input.assigneeId !== undefined) {
    const assigneeId = input.assigneeId ? String(input.assigneeId) : null;
    if (assigneeId) {
      const assignee = await User.findByPk(assigneeId, { attributes: ['id', 'name', 'role'] });
      if (!assignee || assignee.role !== 'admin') throw new HttpError('Requests can only be assigned to an admin', 400);
      await system(ticket.id, 'assigned', { to: assignee.name, by: admin.name }, true);
    }
    changes.assigneeId = assigneeId;
  }
  await ticket.update({ ...changes, adminUnread: false });
  return ticket;
};

/** Turns a request into a dispute on the linked job, or a report about the other person. */
export const escalate = async (ctx: Ctx, ticket: SupportTicket, admin: User, input: Record<string, unknown>) => {
  if (ticket.escalatedTo) throw new HttpError(`This request already became a ${ticket.escalatedTo}`, 409);
  if (!ticket.userId) throw new HttpError('Only requests from signed-in people can be escalated', 409);
  const first = await SupportMessage.findOne({ where: { ticketId: ticket.id, authorRole: 'user' }, order: [['createdAt', 'ASC']] });
  const details = `${ticket.subject}. ${first?.body ?? ''}`.trim().slice(0, 2000);

  const matchId =
    ticket.relatedType === 'match'
      ? ticket.relatedId
      : ticket.relatedType === 'transaction'
        ? (await Transaction.findByPk(ticket.relatedId!, { attributes: ['matchId'] }))?.matchId
        : null;

  if (input.to === 'dispute') {
    if (!matchId) throw new HttpError('Link a job to this request before opening a dispute', 409);
    const reason = String(input.reason ?? 'other');
    const dispute = await disputeService.open(ctx, { matchId, userId: ticket.userId, reason, details });
    await ticket.update({ escalatedTo: 'dispute', escalatedId: dispute.id });
    await system(ticket.id, 'escalated_dispute', { by: admin.name });
    return { kind: 'dispute', id: dispute.id };
  }

  if (input.to === 'report') {
    let reportedUserId = input.reportedUserId ? String(input.reportedUserId) : null;
    if (!reportedUserId && matchId) {
      const match = await Match.findByPk(matchId, { include: [{ model: Gig, as: 'gig', attributes: ['clientId'] }] });
      const clientId = (match as Match & { gig?: Gig } | null)?.gig?.clientId;
      reportedUserId = match ? (match.workerId === ticket.userId ? clientId ?? null : match.workerId) : null;
    }
    if (!reportedUserId || reportedUserId === ticket.userId) throw new HttpError('Choose who the report is about', 400);
    const reason = String(input.reason ?? 'other');
    const report = await Report.create({
      reporterId: ticket.userId,
      reportedUserId,
      reason: (['payment_outside', 'fake_profile', 'no_show', 'harassment', 'other'].includes(reason) ? reason : 'other') as Report['reason'],
      note: `From support request ${ticket.number}: ${details}`.slice(0, 1000),
      resolvedBy: null,
      resolvedAt: null,
      resolutionNote: null,
    });
    await ticket.update({ escalatedTo: 'report', escalatedId: report.id });
    await system(ticket.id, 'escalated_report', { by: admin.name });
    return { kind: 'report', id: report.id };
  }
  throw new HttpError('Escalate to a dispute or a report', 400);
};

/** What the admin sees beside the thread: who this is and how they have done on Isoko. */
export const personSummary = async (userId: string | null) => {
  if (!userId) return null;
  const user = await User.findByPk(userId);
  if (!user) return null;
  const [jobs, tickets] = await Promise.all([
    Match.findAll({
      where: { [Op.or]: [{ workerId: userId }, { '$gig.clientId$': userId }] },
      include: [{ model: Gig, as: 'gig', attributes: ['id', 'title', 'clientId', 'budget'] }],
      order: [['createdAt', 'DESC']],
      limit: 5,
    }),
    SupportTicket.findAll({
      where: { userId },
      attributes: ['id', 'number', 'subject', 'status', 'category', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 6,
    }),
  ]);
  const p = user.privateJSON();
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl,
    trustScore: user.trustScore,
    reviewCount: user.reviewCount,
    completedJobCount: user.completedJobCount,
    emailVerifiedAt: p.emailVerifiedAt,
    phoneVerifiedAt: p.phoneVerifiedAt,
    createdAt: user.createdAt,
    recentJobs: jobs.map((m) => ({
      id: m.id,
      gigId: (m as Match & { gig?: Gig }).gig?.id,
      title: (m as Match & { gig?: Gig }).gig?.title,
      status: m.status,
      asWorker: m.workerId === userId,
    })),
    tickets,
  };
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** The figures at the top of the inbox, over the last 30 days. */
export const metrics = async () => {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [byStatus, unassigned, recent] = await Promise.all([
    SupportTicket.findAll({ attributes: ['status'], raw: true }),
    SupportTicket.count({ where: { status: ['open', 'waiting_on_user'], assigneeId: null } }),
    SupportTicket.findAll({ where: { createdAt: { [Op.gte]: since } }, attributes: ['createdAt', 'firstResponseAt', 'helpful', 'category'] }),
  ]);
  const count = (s: SupportStatus) => byStatus.filter((t) => t.status === s).length;
  const responses = recent
    .filter((t) => t.firstResponseAt)
    .map((t) => (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / 3_600_000);
  const rated = recent.filter((t) => t.helpful !== null);
  const byCategory: Record<string, number> = {};
  for (const t of recent) byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
  return {
    open: count('open'),
    waiting: count('waiting_on_user'),
    resolved: count('resolved'),
    closed: count('closed'),
    unassigned,
    medianFirstReplyHours: median(responses),
    satisfaction: rated.length ? rated.filter((t) => t.helpful).length / rated.length : null,
    ratedCount: rated.length,
    last30Days: recent.length,
    byCategory,
  };
};

/** Resolved requests nobody has written in for a week are closed. */
export const autoClose = async () => {
  const stale = await SupportTicket.findAll({
    where: { status: 'resolved', resolvedAt: { [Op.lt]: new Date(Date.now() - AUTO_CLOSE_AFTER_MS) } },
  });
  for (const ticket of stale) {
    await system(ticket.id, 'auto_closed');
    await ticket.update({ status: 'closed', closedAt: new Date() });
  }
  return stale.length;
};
