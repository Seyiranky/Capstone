'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MatchWeightProfile extends Model {}
  MatchWeightProfile.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      weights: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      distanceHalfLifeKm: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 3,
      },
      maxDistanceKm: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 15,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      modelName: 'MatchWeightProfile',
    },
  );
  return MatchWeightProfile;
};
