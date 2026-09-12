'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Match extends Model {
    static associate(models) {
      Match.belongsTo(models.Gig, { foreignKey: 'gigId', as: 'gig' });
      Match.belongsTo(models.User, { foreignKey: 'workerId', as: 'worker' });
      Match.hasOne(models.Transaction, { foreignKey: 'matchId', as: 'transaction' });
      Match.hasMany(models.Review, { foreignKey: 'matchId', as: 'reviews' });
    }
  }
  Match.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      gigId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      workerId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
        validate: { isIn: [['pending', 'accepted', 'completed', 'cancelled']] },
      },
      rankScore: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Match',
    },
  );
  return Match;
};
