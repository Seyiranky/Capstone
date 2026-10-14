import type { Request, Response } from 'express';
import { Op, type WhereOptions } from 'sequelize';
import { SupportSavedReply, SupportTicket, User } from '../models';
import type { SupportTicket as Ticket } from '../models/SupportTicket';
import { authed } from '../lib/authed';
import { pathParam } from '../lib/query';
import { HttpError } from '../lib/httpError';
import * as supportService from '../services/supportService';

// ── People ───────────────────────────────────────────────────────────────────

/** A request the caller made, or a 404: no one learns that another person's exists. */
const ownTicket = async (req: Request): Promise<Ticket> => {
  const ticket = await SupportTicket.findOne({ where: { id: pathParam(req, 'id'), userId: authed(req).id } });
  if (!ticket) throw new HttpError('Request not found', 404);
  return ticket;
};

const withThread = async (ticket: Ticket, viewer: 'requester' | 'admin') => ({
  ...(viewer === 'requester' ? ticket.forRequester() : ticket.get({ plain: true })),
  related: await supportService.relatedSummary(ticket.relatedType, ticket.relatedId),
  messages: await supportService.thread(ticket.id, viewer),
});

export const create = async (req: Request, res: Response): Promise<void> => {
  const ticket = await supportService.create(req, authed(req).id, req.body ?? {}, req.file);
  res.status(201).json(await withThread(ticket, 'requester'));
};

export const listMine = async (req: Request, res: Response): Promise<void> => {
  const tickets = await SupportTicket.findAll({
    where: { userId: authed(req).id },
    order: [['lastMessageAt', 'DESC']],
  });
  res.json(tickets.map((t) => t.forRequester()));
};

export const getMine = async (req: Request, res: Response): Promise<void> => {
  const ticket = await ownTicket(req);
  if (ticket.userUnread) await ticket.update({ userUnread: false });
  res.json(await withThread(ticket, 'requester'));
};

export const replyMine = async (req: Request, res: Response): Promise<void> => {
  const ticket = await ownTicket(req);
  const me = await User.findByPk(authed(req).id, { attributes: ['id', 'name'] });
  await supportService.reply(req, ticket, { id: me!.id, role: 'user', name: me!.name }, req.body ?? {}, req.file);
  res.status(201).json(await withThread(await ticket.reload(), 'requester'));
};

export const closeMine = async (req: Request, res: Response): Promise<void> => {
  const ticket = await supportService.close(await ownTicket(req));
  res.json(await withThread(ticket, 'requester'));
};

export const rateMine = async (req: Request, res: Response): Promise<void> => {
  const ticket = await supportService.rate(await ownTicket(req), req.body?.helpful, req.body?.comment);
  res.json(await withThread(ticket, 'requester'));
};

export const linkable = async (req: Request, res: Response): Promise<void> => {
  res.json(await supportService.linkableFor(authed(req).id));
};

/** How many of the caller's requests have something new from the team, for the sidebar. */
export const unreadCount = async (req: Request, res: Response): Promise<void> => {
  res.json({ count: await SupportTicket.count({ where: { userId: authed(req).id, userUnread: true } }) });
};

// ── Signed out ───────────────────────────────────────────────────────────────

export const createGuest = async (req: Request, res: Response): Promise<void> => {
  // A field people never see; anything that fills it in is a bot, and is told it worked.
  if (req.body?.website) {
    res.status(201).json({ number: 'SUP-0000-0000' });
    return;
  }
  const { number } = await supportService.createGuest(req, req.body ?? {});
  // The link goes only to the email address, which is what proves the person owns it.
  res.status(201).json({ number });
};

const guestTicket = async (req: Request) => {
  const ticket = await supportService.findByGuestToken(pathParam(req, 'token'));
  if (!ticket) throw new HttpError('This link is not valid', 404);
  return ticket;
};

export const getGuest = async (req: Request, res: Response): Promise<void> => {
  const ticket = await guestTicket(req);
  if (ticket.userUnread) await ticket.update({ userUnread: false });
  res.json(await withThread(ticket, 'requester'));
};

export const replyGuest = async (req: Request, res: Response): Promise<void> => {
  const ticket = await guestTicket(req);
  await supportService.reply(req, ticket, { id: null, role: 'guest', name: ticket.guestName ?? 'Guest' }, req.body ?? {}, req.file);
  res.status(201).json(await withThread(await ticket.reload(), 'requester'));
};

// ── Admins ───────────────────────────────────────────────────────────────────

const adminTicket = async (req: Request) => {
  const ticket = await SupportTicket.findByPk(pathParam(req, 'id'));
  if (!ticket) throw new HttpError('Request not found', 404);
  return ticket;
};

const PEOPLE = [
  { model: User, as: 'user', attributes: ['id', 'name', 'avatarUrl', 'role'] },
  { model: User, as: 'assignee', attributes: ['id', 'name', 'avatarUrl'] },
];

/** The inbox: filtered, the oldest-waiting first, with the figures for the top of the page. */
export const adminList = async (req: Request, res: Response): Promise<void> => {
  const q = req.query;
  const where: Record<string | symbol, unknown> = {};
  const status = String(q.status ?? 'active');
  if (status === 'active') where.status = ['open', 'waiting_on_user'];
  else if (status !== 'all') where.status = status;
  if (q.category) where.category = String(q.category);
  if (q.priority) where.priority = String(q.priority);
  if (q.assignee === 'me') where.assigneeId = authed(req).id;
  if (q.assignee === 'none') where.assigneeId = null;
  if (q.q) {
    const like = `%${String(q.q).trim()}%`;
    where[Op.or] = [
      { subject: { [Op.iLike]: like } },
      { number: { [Op.iLike]: like } },
      { guestName: { [Op.iLike]: like } },
      { guestEmail: { [Op.iLike]: like } },
      { '$user.name$': { [Op.iLike]: like } },
    ];
  }
  const tickets = await SupportTicket.findAll({
    where: where as WhereOptions,
    include: PEOPLE,
    // Waiting on the team first; among those, urgent first and then whoever has waited longest.
    order: [
      ['adminUnread', 'DESC'],
      [SupportTicket.sequelize!.literal(`CASE "SupportTicket"."priority" WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`), 'ASC'],
      ['lastMessageAt', 'ASC'],
    ],
    limit: 200,
  });
  const [metrics, admins] = await Promise.all([
    supportService.metrics(),
    User.findAll({ where: { role: 'admin' }, attributes: ['id', 'name', 'avatarUrl'] }),
  ]);
  res.json({ tickets: tickets.map((t) => { const { guestTokenHash: _h, ...rest } = t.get({ plain: true }) as Record<string, unknown>; return rest; }), metrics, admins });
};

export const adminGet = async (req: Request, res: Response): Promise<void> => {
  const ticket = await adminTicket(req);
  if (ticket.adminUnread) await ticket.update({ adminUnread: false });
  const full = await SupportTicket.findByPk(ticket.id, { include: PEOPLE });
  const { guestTokenHash: _h, ...plain } = full!.get({ plain: true }) as Record<string, unknown>;
  res.json({
    ...plain,
    related: await supportService.relatedSummary(ticket.relatedType, ticket.relatedId),
    messages: await supportService.thread(ticket.id, 'admin'),
    person: await supportService.personSummary(ticket.userId),
  });
};

const me = async (req: Request) => (await User.findByPk(authed(req).id))!;

export const adminReply = async (req: Request, res: Response): Promise<void> => {
  const ticket = await adminTicket(req);
  await supportService.adminReply(req, ticket, await me(req), req.body ?? {}, req.file);
  res.status(201).json({ ok: true });
};

export const adminUpdate = async (req: Request, res: Response): Promise<void> => {
  const ticket = await adminTicket(req);
  await supportService.update(ticket, await me(req), req.body ?? {});
  res.json({ ok: true });
};

export const adminEscalate = async (req: Request, res: Response): Promise<void> => {
  const ticket = await adminTicket(req);
  res.status(201).json(await supportService.escalate(req, ticket, await me(req), req.body ?? {}));
};

/** For the admin sidebar: requests waiting on the team. */
export const adminUnreadCount = async (_req: Request, res: Response): Promise<void> => {
  res.json({ count: await SupportTicket.count({ where: { adminUnread: true, status: { [Op.ne]: 'closed' } } }) });
};

// ── Saved replies ────────────────────────────────────────────────────────────

const replyFields = (body: Record<string, unknown> | undefined) => {
  const title = String(body?.title ?? '').trim().slice(0, 80);
  const text = String(body?.body ?? '').trim().slice(0, 2000);
  if (!title || !text) throw new HttpError('A saved reply needs a title and text', 400);
  const bodyRw = String(body?.bodyRw ?? '').trim().slice(0, 2000) || null;
  const category = body?.category ? String(body.category) : null;
  return { title, body: text, bodyRw, category };
};

export const listSavedReplies = async (_req: Request, res: Response): Promise<void> => {
  res.json(await SupportSavedReply.findAll({ order: [['usageCount', 'DESC'], ['title', 'ASC']] }));
};

export const createSavedReply = async (req: Request, res: Response): Promise<void> => {
  res.status(201).json(await SupportSavedReply.create({ ...replyFields(req.body), createdBy: authed(req).id }));
};

export const updateSavedReply = async (req: Request, res: Response): Promise<void> => {
  const saved = await SupportSavedReply.findByPk(pathParam(req, 'id'));
  if (!saved) throw new HttpError('Saved reply not found', 404);
  res.json(await saved.update(replyFields(req.body)));
};

export const deleteSavedReply = async (req: Request, res: Response): Promise<void> => {
  await SupportSavedReply.destroy({ where: { id: pathParam(req, 'id') } });
  res.status(204).end();
};
