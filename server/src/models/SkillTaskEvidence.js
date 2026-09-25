'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SkillTaskEvidence extends Model {
    static associate(models) {
      SkillTaskEvidence.belongsTo(models.SkillTask, { foreignKey: 'taskId', as: 'task' });
    }
  }
  SkillTaskEvidence.init(
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
      kind: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [['photo', 'video', 'voice', 'link', 'document']] },
      },
      url: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      mimeType: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      sizeBytes: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      durationSec: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      sha256: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      capturedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'SkillTaskEvidence',
    },
  );
  return SkillTaskEvidence;
};
