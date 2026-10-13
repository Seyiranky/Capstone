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
import type { PollVote } from './PollVote';

export type PollStatus = 'open' | 'closed';

/** A question on a platform rule, put to the workers. */
export class Poll extends Model<InferAttributes<Poll>, InferCreationAttributes<Poll>> {
  declare id: CreationOptional<string>;
  declare question: string;
  declare details: string | null;
  declare options: string[];
  declare status: CreationOptional<PollStatus>;
  declare closesAt: Date;
  declare createdBy: string | null;
  /** What the platform did about the result. Required to close a poll. */
  declare outcome: string | null;
  declare closedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare votes?: NonAttribute<PollVote[]>;

  static associate(models: Db) {
    Poll.hasMany(models.PollVote, { foreignKey: 'pollId', as: 'votes' });
  }
}

export const initPoll = (sequelize: Sequelize) => {
  Poll.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      question: { type: DataTypes.STRING(200), allowNull: false },
      details: { type: DataTypes.TEXT, allowNull: true },
      options: { type: DataTypes.JSONB, allowNull: false },
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'open', validate: { isIn: [['open', 'closed']] } },
      closesAt: { type: DataTypes.DATE, allowNull: false },
      createdBy: { type: DataTypes.UUID, allowNull: true },
      outcome: { type: DataTypes.TEXT, allowNull: true },
      closedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'Poll' },
  );
  return Poll;
};
