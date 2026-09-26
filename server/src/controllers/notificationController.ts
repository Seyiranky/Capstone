import type { Request, Response } from 'express';
import { Notification } from '../models';
import { authed } from '../lib/authed';
import { pathParam } from '../lib/query';

export const listNotifications = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const notifications = await Notification.findAll({
    where: { userId: user.id },
    order: [['createdAt', 'DESC']],
  });
  res.json(notifications);
};

export const markRead = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const notification = await Notification.findOne({
    where: { id: pathParam(req, 'id'), userId: user.id },
  });
  if (!notification) {
    res.status(404).json({ message: 'Notification not found' });
    return;
  }

  if (!notification.readAt) {
    await notification.update({ readAt: new Date() });
  }

  res.json(notification);
};
