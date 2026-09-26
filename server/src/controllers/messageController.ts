import { Op } from 'sequelize';
import type { Request, Response } from 'express';
import { Message, User } from '../models';
import { authed } from '../lib/authed';
import { ioFrom } from '../lib/io';
import { stringParam } from '../lib/query';
import type { Role } from '../types/domain';

const ALLOWED_PAIRS: [Role, Role][] = [
  ['worker', 'admin'],
  ['worker', 'client'],
];

const canMessage = (roleA: Role, roleB: Role) =>
  ALLOWED_PAIRS.some(([a, b]) => (roleA === a && roleB === b) || (roleA === b && roleB === a));

export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const { recipientId, body } = req.body ?? {};
  if (!recipientId || !body) {
    res.status(400).json({ message: 'recipientId and body are required' });
    return;
  }
  if (recipientId === user.id) {
    res.status(400).json({ message: 'Cannot send a message to yourself' });
    return;
  }

  const recipient = await User.findByPk(recipientId);
  if (!recipient) {
    res.status(404).json({ message: 'Recipient not found' });
    return;
  }

  if (!canMessage(user.role, recipient.role)) {
    res.status(403).json({ message: 'Messaging is not available between these two roles' });
    return;
  }

  const message = await Message.create({ senderId: user.id, recipientId, body });

  // Push the new message to both participants in real time. Emitting to the
  // sender too keeps their other open tabs/devices in sync; the client
  // de-duplicates by message id.
  const io = ioFrom(req);
  if (io) {
    io.to(recipientId).to(user.id).emit('message:new', message);
  }

  res.status(201).json(message);
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

  const seen = new Map<string, User>();
  for (const message of messages) {
    const other = message.senderId === user.id ? message.recipient : message.sender;
    if (other) seen.set(other.id, other);
  }

  res.json(Array.from(seen.values()));
};
