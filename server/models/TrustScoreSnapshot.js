'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TrustScoreSnapshot extends Model {
    static associate(models) {
      TrustScoreSnapshot.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    }
  }
  TrustScoreSnapshot.init(
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
      score: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      components: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      formulaVersion: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      trigger: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'TrustScoreSnapshot',
    },
  );
  return TrustScoreSnapshot;
};
