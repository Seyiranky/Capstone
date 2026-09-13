'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class GigApplication extends Model {
    static associate(models) {
      GigApplication.belongsTo(models.Gig, { foreignKey: 'gigId', as: 'gig' });
      GigApplication.belongsTo(models.User, { foreignKey: 'workerId', as: 'worker' });
    }
  }
  GigApplication.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      gigId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      workerId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
        validate: { isIn: [['pending', 'approved', 'rejected']] },
      },
      rankScore: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      scoreBreakdown: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      weightProfileId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      occurredAt: { type: DataTypes.DATE, allowNull: true },
      wasQueuedOffline: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      sequelize,
      modelName: 'GigApplication',
    },
  );
  return GigApplication;
};
