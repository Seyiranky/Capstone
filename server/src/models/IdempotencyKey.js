'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IdempotencyKey extends Model {}
  IdempotencyKey.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      key: { type: DataTypes.STRING, allowNull: false },
      scope: { type: DataTypes.STRING, allowNull: false },
      statusCode: { type: DataTypes.INTEGER, allowNull: true },
      responseBody: { type: DataTypes.JSONB, allowNull: true },
      completedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { sequelize, modelName: 'IdempotencyKey' },
  );
  return IdempotencyKey;
};
