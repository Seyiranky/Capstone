'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SkillPassport extends Model {
    static associate(models) {
      SkillPassport.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    }
  }
  SkillPassport.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      tokenId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      issuedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'SkillPassport',
    },
  );
  return SkillPassport;
};
