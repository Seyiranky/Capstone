'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class NotificationDelivery extends Model {
    static associate(models) {
      NotificationDelivery.belongsTo(models.Notification, {
        foreignKey: 'notificationId',
        as: 'notification',
      });
    }
  }
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
    },
    { sequelize, modelName: 'NotificationDelivery' },
  );
  return NotificationDelivery;
};
