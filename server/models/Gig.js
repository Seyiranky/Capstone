'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Gig extends Model {
    static associate(models) {
      Gig.belongsTo(models.User, { foreignKey: 'clientId', as: 'client' });
      Gig.belongsTo(models.Skill, { foreignKey: 'skillId', as: 'skill' });
      Gig.hasMany(models.Match, { foreignKey: 'gigId', as: 'matches' });
      Gig.hasMany(models.GigApplication, { foreignKey: 'gigId', as: 'applications' });
    }
  }
  Gig.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      clientId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      skillId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      budget: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      locationLat: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      locationLng: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending_review',
        validate: { isIn: [['pending_review', 'open', 'matched', 'completed', 'cancelled', 'rejected']] },
      },
      imageUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Gig',
    },
  );
  return Gig;
};
