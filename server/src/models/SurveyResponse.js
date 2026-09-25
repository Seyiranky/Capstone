'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SurveyResponse extends Model {
    static associate(models) {
      SurveyResponse.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    }
  }
  SurveyResponse.init(
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
      promptKey: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      value: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 7 },
      },
      context: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'SurveyResponse',
    },
  );
  return SurveyResponse;
};
