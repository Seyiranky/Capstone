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

export class Review extends Model<InferAttributes<Review>, InferCreationAttributes<Review>> {
  declare id: CreationOptional<string>;
  declare matchId: string;
  declare authorId: string;
  declare recipientId: string;
  declare rating: number;
  declare comment: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare match?: NonAttribute<Match>;
  declare author?: NonAttribute<User>;
  declare recipient?: NonAttribute<User>;

  static associate(models: Db) {
    Review.belongsTo(models.Match, { foreignKey: 'matchId', as: 'match' });
    Review.belongsTo(models.User, { foreignKey: 'authorId', as: 'author' });
    Review.belongsTo(models.User, { foreignKey: 'recipientId', as: 'recipient' });
  }
}

export const initReview = (sequelize: Sequelize) => {
  Review.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      matchId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      authorId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      recipientId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      rating: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 5 },
      },
      comment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Review',
    },
  );
  return Review;
};
