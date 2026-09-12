const { Op } = require('sequelize');
const { Message, User } = require('../models');

const ALLOWED_PAIRS = [
  ['worker', 'admin'],
  ['worker', 'client'],
];

const canMessage = (roleA, roleB) =>
  ALLOWED_PAIRS.some(([a, b]) => (roleA === a && roleB === b) || (roleA === b && roleB === a));

exports.sendMessage = async (req, res) => {
  const { recipientId, body } = req.body;
  if (!recipientId || !body) {
    return res.status(400).json({ message: 'recipientId and body are required' });
  }
  if (recipientId === req.user.id) {
    return res.status(400).json({ message: 'Cannot send a message to yourself' });
  }

  const recipient = await User.findByPk(recipientId);
  if (!recipient) {
    return res.status(404).json({ message: 'Recipient not found' });
  }

  if (!canMessage(req.user.role, recipient.role)) {
    return res.status(403).json({ message: 'Messaging is not available between these two roles' });
  }

  const message = await Message.create({ senderId: req.user.id, recipientId, body });

  // Push the new message to both participants in real time. Emitting to the
  // sender too keeps their other open tabs/devices in sync; the client
  // de-duplicates by message id.
  const io = req.app.get('io');
  if (io) {
    io.to(recipientId).to(req.user.id).emit('message:new', message);
  }

  res.status(201).json(message);
};

exports.listMessages = async (req, res) => {
  const { recipientId } = req.query;
  if (!recipientId) {
    return res.status(400).json({ message: 'recipientId query parameter is required' });
  }

  const messages = await Message.findAll({
    where: {
      [Op.or]: [
        { senderId: req.user.id, recipientId },
        { senderId: recipientId, recipientId: req.user.id },
      ],
    },
    order: [['createdAt', 'ASC']],
  });

  res.json(messages);
};

exports.listContacts = async (req, res) => {
  const messages = await Message.findAll({
    where: {
      [Op.or]: [{ senderId: req.user.id }, { recipientId: req.user.id }],
    },
    include: [
      { model: User, as: 'sender' },
      { model: User, as: 'recipient' },
    ],
    order: [['createdAt', 'DESC']],
  });

  const seen = new Map();
  for (const message of messages) {
    const other = message.senderId === req.user.id ? message.recipient : message.sender;
    if (other) seen.set(other.id, other);
  }

  res.json(Array.from(seen.values()));
};
