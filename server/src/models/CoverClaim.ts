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
import type { Match } from './Match';
import type { User } from './User';

export type CoverClaimStatus = 'submitted' | 'approved' | 'declined';

/** A covered worker asking the (simulated) insurer to pay for an accident on the job. */
export class CoverClaim extends Model<InferAttributes<CoverClaim>, InferCreationAttributes<CoverClaim>> {
  declare id: CreationOptional<string>;
  declare transactionId: string | null;
  declare matchId: string;
  declare userId: string;
  declare description: string;
  declare amountRequested: number;
  declare amountApproved: number | null;
  declare status: CreationOptional<CoverClaimStatus>;
  declare decisionNote: string | null;
  declare decidedBy: string | null;
  declare decidedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare match?: NonAttribute<Match>;
  declare user?: NonAttribute<User>;

  static associate(models: Db) {
    CoverClaim.belongsTo(models.Match, { foreignKey: 'matchId', as: 'match' });
    CoverClaim.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    CoverClaim.belongsTo(models.Transaction, { foreignKey: 'transactionId', as: 'transaction' });
  }
}

export const initCoverClaim = (sequelize: Sequelize) => {
  CoverClaim.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      transactionId: { type: DataTypes.UUID, allowNull: true },
      matchId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false },
      amountRequested: { type: DataTypes.INTEGER, allowNull: false },
      amountApproved: { type: DataTypes.INTEGER, allowNull: true },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'submitted',
        validate: { isIn: [['submitted', 'approved', 'declined']] },
      },
      decisionNote: { type: DataTypes.TEXT, allowNull: true },
      decidedBy: { type: DataTypes.UUID, allowNull: true },
      decidedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'CoverClaim' },
  );
  return CoverClaim;
};
