import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import type { Db } from './index';

/** One worker's vote. Never shown with the voter: results are counts only. */
export class PollVote extends Model<InferAttributes<PollVote>, InferCreationAttributes<PollVote>> {
  declare id: CreationOptional<string>;
  declare pollId: string;
  declare userId: string;
  declare optionIndex: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static associate(models: Db) {
    PollVote.belongsTo(models.Poll, { foreignKey: 'pollId', as: 'poll' });
  }
}

export const initPollVote = (sequelize: Sequelize) => {
  PollVote.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      pollId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      optionIndex: { type: DataTypes.INTEGER, allowNull: false },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'PollVote' },
  );
  return PollVote;
};
