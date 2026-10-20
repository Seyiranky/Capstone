import fs from 'fs';
import crypto from 'crypto';
import { Op, fn, col } from 'sequelize';
import type { Request, Response } from 'express';
import { Message, User } from '../models';
import { authed } from '../lib/authed';
import { ioFrom } from '../lib/io';
import { stringParam } from '../lib/query';
import { offPlatformFlag } from '../lib/offPlatform';
import { bareMime, checkVoiceNote, fieldFile } from '../middleware/upload';
import type { Role } from '../types/domain';

const ALLOWED_PAIRS: [Role, Role][] = [
  ['worker', 'admin'],
  ['worker', 'client'],
  // Admins answer clients too: about an application, a dispute or a support request.
  ['client', 'admin'],
];

const BODY_MAX = 4000;

const canMessage = (roleA: Role, roleB: Role) =>
  ALLOWED_PAIRS.some(([a, b]) => (roleA === a && roleB === b) || (roleA === b && roleB === a));

/**
 * Sends a message: text, a photo, a voice note, or a mix.
 *
 * Accepts JSON for text and multipart (fields `image` and `audio`, with
 * `audioDurationSec`) for media, so the existing text-only callers are unchanged.
 */
export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const file = fieldFile(req, 'image');
  const audio = fieldFile(req, 'audio');
  const discard = () => [file, audio].forEach((f) => f && fs.rmSync(f.path, { force: true }));
  const recipientId = req.body?.recipientId;
  const body = String(req.body?.body ?? '').trim().slice(0, BODY_MAX);

  if (!recipientId || (!body && !file && !audio)) {
    discard();
    res.status(400).json({ message: 'recipientId and a message, a photo or a voice note are required' });
    return;
  }
  const voice = audio ? checkVoiceNote(audio, req.body?.audioDurationSec) : null;
  if (voice && 'error' in voice) {
    discard();
    res.status(400).json({ message: voice.error });
    return;
  }
  if (recipientId === user.id) {
    discard();
    res.status(400).json({ message: 'Cannot send a message to yourself' });
    return;
  }

  const recipient = await User.findByPk(recipientId);
  if (!recipient) {
    discard();
    res.status(404).json({ message: 'Recipient not found' });
    return;
  }

  if (!canMessage(user.role, recipient.role)) {
    discard();
    res.status(403).json({ message: 'Messaging is not available between these two roles' });
    return;
  }

  const message = await Message.create({
    offPlatformFlag: offPlatformFlag(body),
    senderId: user.id,
    recipientId,
    body,
    imageUrl: file ? `/uploads/messages/${file.filename}` : null,
    imageMimeType: file?.mimetype ?? null,
    imageSha256: file ? crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex') : null,
    audioUrl: audio ? `/uploads/messages/${audio.filename}` : null,
    audioMimeType: audio ? bareMime(audio.mimetype) : null,
    audioDurationSec: voice && 'durationSec' in voice ? voice.durationSec : null,
    readAt: null,
  });

  // Push the new message to both participants in real time. Emitting to the
  // sender too keeps their other open tabs/devices in sync; the client
  // de-duplicates by message id. The sender's name rides along so the
  // recipient can be told who wrote without another request.
  const io = ioFrom(req);
  const payload = { ...message.toJSON(), sender: { id: user.id, name: (await User.findByPk(user.id))?.name } };
  if (io) {
    io.to(recipientId).to(user.id).emit('message:new', payload);
  }

  res.status(201).json(payload);
};

export const listMessages = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const recipientId = stringParam(req, 'recipientId');
  if (!recipientId) {
    res.status(400).json({ message: 'recipientId query parameter is required' });
    return;
  }

  const messages = await Message.findAll({
    where: {
      [Op.or]: [
        { senderId: user.id, recipientId },
        { senderId: recipientId, recipientId: user.id },
      ],
    },
    order: [['createdAt', 'ASC']],
  });

  res.json(messages);
};

/**
 * Marks everything a contact has sent the caller as read, and tells the
 * contact, so their side can show "Seen".
 */
export const markRead = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const contactId = String(req.body?.contactId ?? '');
  if (!contactId) {
    res.status(400).json({ message: 'contactId is required' });
    return;
  }
  const readAt = new Date();
  const [count] = await Message.update(
    { readAt },
    { where: { senderId: contactId, recipientId: user.id, readAt: null } },
  );
  if (count > 0) {
    ioFrom(req)?.to(contactId).emit('message:read', { readerId: user.id, readAt });
  }
  res.json({ marked: count, readAt });
};

/** People the caller has a conversation with, newest first, with unread counts and a preview. */
export const listContacts = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const messages = await Message.findAll({
    where: {
      [Op.or]: [{ senderId: user.id }, { recipientId: user.id }],
    },
    include: [
      { model: User, as: 'sender' },
      { model: User, as: 'recipient' },
    ],
    order: [['createdAt', 'DESC']],
  });

  const unreadRows = (await Message.findAll({
    attributes: ['senderId', [fn('COUNT', col('id')), 'unread']],
    where: { recipientId: user.id, readAt: null },
    group: ['senderId'],
    raw: true,
  })) as unknown as { senderId: string; unread: string }[];
  const unread = new Map(unreadRows.map((r) => [r.senderId, Number(r.unread)]));

  const seen = new Map<string, Record<string, unknown>>();
  for (const message of messages) {
    const other = message.senderId === user.id ? message.recipient : message.sender;
    if (!other || seen.has(other.id)) continue;
    seen.set(other.id, {
      ...other.toJSON(),
      unreadCount: unread.get(other.id) ?? 0,
      lastMessage: {
        body: message.body,
        hasImage: Boolean(message.imageUrl),
        hasAudio: Boolean(message.audioUrl),
        fromMe: message.senderId === user.id,
        createdAt: message.createdAt,
      },
    });
  }

  res.json(Array.from(seen.values()));
};
