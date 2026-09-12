'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SkillTaskAssignment extends Model {
    static associate(models) {
      SkillTaskAssignment.belongsTo(models.SkillTask, { foreignKey: 'taskId', as: 'task' });
      SkillTaskAssignment.belongsTo(models.User, { foreignKey: 'reviewerId', as: 'reviewer' });
    }
  }
  SkillTaskAssignment.init(
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
      reviewerId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      round: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
        validate: { isIn: [['pending', 'approved', 'rejected', 'recused', 'expired']] },
      },
      confidence: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { min: 1, max: 5 },
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      assignmentSeed: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      eligiblePoolSize: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      assignedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      decidedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'SkillTaskAssignment',
    },
  );
  return SkillTaskAssignment;
};
