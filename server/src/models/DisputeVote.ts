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
import type { DisputeOutcome } from '../types/domain';
import type { Dispute } from './Dispute';
import type { User } from './User';

/** One mediator's seat on a dispute panel; `vote` stays null until they decide. */
export class DisputeVote extends Model<
  InferAttributes<DisputeVote>,
  InferCreationAttributes<DisputeVote>
> {
  declare id: CreationOptional<string>;
  declare disputeId: string;
  declare mediatorId: string;
  declare vote: DisputeOutcome | null;
  declare rationale: string | null;
  declare votedAt: Date | null;
  /** Set when the dispute is decided: whether this mediator sided with the outcome. */
  declare withMajority: boolean | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare dispute?: NonAttribute<Dispute>;
  declare mediator?: NonAttribute<User>;

  static associate(models: Db) {
    DisputeVote.belongsTo(models.Dispute, { foreignKey: 'disputeId', as: 'dispute' });
    DisputeVote.belongsTo(models.User, { foreignKey: 'mediatorId', as: 'mediator' });
  }
}

export const initDisputeVote = (sequelize: Sequelize) => {
  DisputeVote.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      disputeId: { type: DataTypes.UUID, allowNull: false },
      mediatorId: { type: DataTypes.UUID, allowNull: false },
      vote: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { isIn: [['release', 'refund', 'split']] },
      },
      rationale: { type: DataTypes.TEXT, allowNull: true },
      votedAt: { type: DataTypes.DATE, allowNull: true },
      withMajority: { type: DataTypes.BOOLEAN, allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'DisputeVote' },
  );
  return DisputeVote;
};
