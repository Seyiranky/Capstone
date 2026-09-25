import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';
import type { Db } from './index';
import type { DeliveryChannel, DeliveryStatus } from '../types/domain';
import type { Notification } from './Notification';

/**
 * One delivery attempt, recorded whatever the outcome.
 *
 * `skipped` is as important as `sent`: a pilot reporting delivery has to be
 * able to tell "this worker did not want SMS" apart from "we tried and it
 * failed", and only a row can distinguish them after the fact.
 */
export class NotificationDelivery extends Model<
  InferAttributes<NotificationDelivery>,
  InferCreationAttributes<NotificationDelivery>
> {
  declare id: CreationOptional<string>;
  declare notificationId: string;
  declare channel: DeliveryChannel;
  declare status: CreationOptional<DeliveryStatus>;
  declare provider: string | null;
  declare providerMessageId: string | null;
  declare error: string | null;
  declare sentAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare notification?: NonAttribute<Notification>;

  static associate(models: Db) {
    NotificationDelivery.belongsTo(models.Notification, {
      foreignKey: 'notificationId',
      as: 'notification',
    });
  }
}

export const initNotificationDelivery = (sequelize: Sequelize) => {
  NotificationDelivery.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      notificationId: { type: DataTypes.UUID, allowNull: false },
      channel: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [['in_app', 'sms', 'email']] },
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
        validate: { isIn: [['pending', 'sent', 'failed', 'skipped']] },
      },
      provider: { type: DataTypes.STRING, allowNull: true },
      providerMessageId: { type: DataTypes.STRING, allowNull: true },
      error: { type: DataTypes.TEXT, allowNull: true },
      sentAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'NotificationDelivery' },
  );
  return NotificationDelivery;
};
