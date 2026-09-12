'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UserSkill extends Model {
    static associate(models) {
      UserSkill.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
      UserSkill.belongsTo(models.Skill, { foreignKey: 'skillId', as: 'skill' });
    }
  }
  UserSkill.init(
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
      skillId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      proficiencyLevel: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        validate: { min: 1, max: 5 },
      },
      verificationStatus: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'unverified',
        validate: { isIn: [['unverified', 'pending', 'verified']] },
      },
    },
    {
      sequelize,
      modelName: 'UserSkill',
    },
  );
  return UserSkill;
};
