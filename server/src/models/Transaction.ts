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
import type { TransactionStatus } from '../types/domain';
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
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare match?: NonAttribute<Match>;

  static associate(models: Db) {
    Transaction.belongsTo(models.Match, { foreignKey: 'matchId', as: 'match' });
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
