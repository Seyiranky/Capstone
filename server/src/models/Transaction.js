'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Transaction extends Model {
    static associate(models) {
      Transaction.belongsTo(models.Match, { foreignKey: 'matchId', as: 'match' });
    }
  }
  Transaction.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      matchId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'initiated',
        validate: { isIn: [['initiated', 'confirmed', 'failed']] },
      },
      provider: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'simulated-momo',
      },
      // The provider's own identifier, kept verbatim so a payment can be
      // checked against their records rather than only against ours (NFR-8).
      providerReference: { type: DataTypes.STRING, allowNull: true },
      providerStatus: { type: DataTypes.STRING, allowNull: true },
      providerRawResponse: { type: DataTypes.JSONB, allowNull: true },
      callbackReceivedAt: { type: DataTypes.DATE, allowNull: true },
      failureReason: { type: DataTypes.STRING, allowNull: true },
      payerMsisdn: { type: DataTypes.STRING, allowNull: true },
      currency: { type: DataTypes.STRING, allowNull: false, defaultValue: 'RWF' },
      platformFeeAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      reference: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
    },
    {
      sequelize,
      modelName: 'Transaction',
    },
  );
  return Transaction;
};
