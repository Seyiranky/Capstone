'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SkillTaskAppeal extends Model {
    static associate(models) {
      SkillTaskAppeal.belongsTo(models.SkillTask, { foreignKey: 'taskId', as: 'task' });
      SkillTaskAppeal.belongsTo(models.User, { foreignKey: 'workerId', as: 'worker' });
      SkillTaskAppeal.belongsTo(models.User, { foreignKey: 'decidedBy', as: 'decider' });
    }
  }
  SkillTaskAppeal.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      taskId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      workerId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'open',
        validate: { isIn: [['open', 'upheld', 'dismissed']] },
      },
      resolutionNotes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      decidedBy: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      decidedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'SkillTaskAppeal',
    },
  );
  return SkillTaskAppeal;
};
