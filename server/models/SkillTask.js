'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SkillTask extends Model {
    static associate(models) {
      SkillTask.belongsTo(models.User, { foreignKey: 'workerId', as: 'worker' });
      SkillTask.belongsTo(models.User, { foreignKey: 'reviewerId', as: 'reviewer' });
      SkillTask.belongsTo(models.Skill, { foreignKey: 'skillId', as: 'skill' });
    }
  }
  SkillTask.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      workerId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      skillId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      reviewerId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      evidenceUrl: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
        validate: { isIn: [['pending', 'approved', 'rejected']] },
      },
      reviewedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'SkillTask',
    },
  );
  return SkillTask;
};
