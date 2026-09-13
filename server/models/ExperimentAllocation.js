'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ExperimentAllocation extends Model {
    static associate(models) {
      ExperimentAllocation.belongsTo(models.User, {
        foreignKey: 'claimedByUserId',
        as: 'claimedBy',
      });
    }
  }
  ExperimentAllocation.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      experiment: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'rq3_provenance',
      },
      position: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      blockIndex: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      blockSize: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      arm: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      seed: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      claimedByUserId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      claimedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'ExperimentAllocation',
    },
  );
  return ExperimentAllocation;
};
