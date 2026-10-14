import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';
import type { Db } from './index';
import type { EscrowStatus, TransactionStatus } from '../types/domain';
import type { Match } from './Match';

export class Transaction extends Model<
  InferAttributes<Transaction>,
  InferCreationAttributes<Transaction>
> {
  declare id: CreationOptional<string>;
  declare matchId: string;
  declare amount: number;
  declare status: CreationOptional<TransactionStatus>;
  declare provider: CreationOptional<string>;
  declare providerReference: string | null;
  declare providerStatus: string | null;
  /** Whatever the adapter was handed. Genuinely unknown: its shape is the
   *  provider's, not ours, and it is kept for reconciliation rather than read. */
  declare providerRawResponse: unknown;
  declare callbackReceivedAt: Date | null;
  declare failureReason: string | null;
  declare payerMsisdn: string | null;
  declare currency: CreationOptional<string>;
  declare platformFeeAmount: number | null;
  /** The platform's own handle on the payment, kept distinct from the
   *  provider's so a provider change never rewrites our history. */
  declare reference: string;
  declare escrowStatus: CreationOptional<EscrowStatus>;
  declare heldAt: Date | null;
  declare releasedAt: Date | null;
  declare refundedAt: Date | null;
  /** Issued when the money is released; public, so random rather than sequential. */
  declare receiptNumber: string | null;
  /** Set only when less than the full amount went to the worker (a split decision). */
  declare releasedAmount: number | string | null;
  /** The client's optional addition to the worker's safety net, collected with escrow. */
  declare safetyNetContribution: number | string | null;
  /** Job Cover bought with this payment, if any (lib/jobCover). */
  declare coverPremium: CreationOptional<number | string | null>;
  declare coverPolicyNumber: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare match?: NonAttribute<Match>;

  static associate(models: Db) {
    Transaction.belongsTo(models.Match, { foreignKey: 'matchId', as: 'match' });
    Transaction.hasMany(models.Payout, { foreignKey: 'transactionId', as: 'payouts' });
  }
}

export const initTransaction = (sequelize: Sequelize) => {
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
      escrowStatus: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'none',
        validate: { isIn: [['none', 'held', 'released', 'refunded']] },
      },
      heldAt: { type: DataTypes.DATE, allowNull: true },
      releasedAt: { type: DataTypes.DATE, allowNull: true },
      refundedAt: { type: DataTypes.DATE, allowNull: true },
      receiptNumber: { type: DataTypes.STRING, allowNull: true, unique: true },
      releasedAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      safetyNetContribution: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      coverPremium: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      coverPolicyNumber: { type: DataTypes.STRING, allowNull: true, unique: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Transaction',
    },
  );
  return Transaction;
};
