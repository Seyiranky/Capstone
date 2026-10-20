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
import type { DisputeDecider, DisputeOutcome, DisputeReason, DisputeStage, DisputeStatus } from '../types/domain';
import type { DisputeVote } from './DisputeVote';
import type { Match } from './Match';
import type { User } from './User';

/** A disagreement over money held in escrow, judged by a panel of three peers. */
export class Dispute extends Model<InferAttributes<Dispute>, InferCreationAttributes<Dispute>> {
  declare id: CreationOptional<string>;
  declare matchId: string;
  declare openedById: string;
  declare reason: DisputeReason;
  declare details: string;
  /** The other party's side, so mediators hear both before voting. */
  declare response: string | null;
  declare respondedAt: Date | null;
  declare status: CreationOptional<DisputeStatus>;
  declare outcome: DisputeOutcome | null;
  declare decidedBy: DisputeDecider | null;
  declare decidedAt: Date | null;
  declare adminId: string | null;
  declare adminNote: string | null;
  declare deadlineAt: Date;
  /** Recorded so the panel draw can be replayed and shown not to be steered. */
  declare panelSeed: string | null;
  declare panelPoolSize: number | null;
  declare stage: CreationOptional<DisputeStage>;
  /** On a paid job, what the decision says the worker owes back. */
  declare refundDue: CreationOptional<number | string | null>;
  /** The support request opened for an admin to arrange that return. */
  declare supportTicketId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare match?: NonAttribute<Match>;
  declare openedBy?: NonAttribute<User>;
  declare votes?: NonAttribute<DisputeVote[]>;

  static associate(models: Db) {
    Dispute.belongsTo(models.Match, { foreignKey: 'matchId', as: 'match' });
    Dispute.belongsTo(models.User, { foreignKey: 'openedById', as: 'openedBy' });
    Dispute.hasMany(models.DisputeVote, { foreignKey: 'disputeId', as: 'votes' });
  }
}

export const initDispute = (sequelize: Sequelize) => {
  Dispute.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      matchId: { type: DataTypes.UUID, allowNull: false },
      openedById: { type: DataTypes.UUID, allowNull: false },
      reason: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [['notDone', 'poorQuality', 'noShow', 'notReleased', 'notPaid', 'notMarkedDone', 'other']] },
      },
      details: { type: DataTypes.TEXT, allowNull: false },
      response: { type: DataTypes.TEXT, allowNull: true },
      respondedAt: { type: DataTypes.DATE, allowNull: true },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'open',
        validate: { isIn: [['open', 'escalated', 'decided', 'settled']] },
      },
      stage: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'in_progress',
        validate: { isIn: [['in_progress', 'awaiting_payment', 'paid']] },
      },
      refundDue: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      supportTicketId: { type: DataTypes.UUID, allowNull: true },
      outcome: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { isIn: [['release', 'refund', 'split']] },
      },
      decidedBy: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { isIn: [['mediators', 'admin', 'parties']] },
      },
      decidedAt: { type: DataTypes.DATE, allowNull: true },
      adminId: { type: DataTypes.UUID, allowNull: true },
      adminNote: { type: DataTypes.TEXT, allowNull: true },
      deadlineAt: { type: DataTypes.DATE, allowNull: false },
      panelSeed: { type: DataTypes.STRING, allowNull: true },
      panelPoolSize: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'Dispute' },
  );
  return Dispute;
};
