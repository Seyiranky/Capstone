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
import type { PayoutRole } from '../types/domain';
import type { Match } from './Match';
import type { Transaction } from './Transaction';
import type { User } from './User';

/**
 * One person's share of a released payment, with its own receipt.
 *
 * Income statements, wallets and work histories read these, so a crew member
 * or apprentice sees exactly what they were paid and the lead sees only their
 * own share.
 */
export class Payout extends Model<InferAttributes<Payout>, InferCreationAttributes<Payout>> {
  declare id: CreationOptional<string>;
  declare transactionId: string;
  declare matchId: string;
  declare userId: string;
  declare role: PayoutRole;
  declare amount: number | string;
  declare currency: CreationOptional<string>;
  declare receiptNumber: string;
  declare releasedAt: Date;
  /** Whether the money was sent to the worker's MoMo number (Disbursements API). */
  declare transferStatus: CreationOptional<'not_sent' | 'sent' | 'failed' | 'no_number'>;
  declare transferReference: CreationOptional<string | null>;
  declare transferError: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare match?: NonAttribute<Match>;
  declare transaction?: NonAttribute<Transaction>;
  declare user?: NonAttribute<User>;

  static associate(models: Db) {
    Payout.belongsTo(models.Match, { foreignKey: 'matchId', as: 'match' });
    Payout.belongsTo(models.Transaction, { foreignKey: 'transactionId', as: 'transaction' });
    Payout.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  }
}

export const initPayout = (sequelize: Sequelize) => {
  Payout.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      transactionId: { type: DataTypes.UUID, allowNull: false },
      matchId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      role: { type: DataTypes.STRING, allowNull: false, validate: { isIn: [['lead', 'crew', 'apprentice']] } },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      currency: { type: DataTypes.STRING, allowNull: false, defaultValue: 'RWF' },
      receiptNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
      releasedAt: { type: DataTypes.DATE, allowNull: false },
      transferStatus: { type: DataTypes.STRING, allowNull: false, defaultValue: 'not_sent' },
      transferReference: { type: DataTypes.STRING, allowNull: true },
      transferError: { type: DataTypes.TEXT, allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'Payout' },
  );
  return Payout;
};
