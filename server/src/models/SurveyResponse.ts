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
import type { User } from './User';

export class SurveyResponse extends Model<
  InferAttributes<SurveyResponse>,
  InferCreationAttributes<SurveyResponse>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare promptKey: string;
  /** 1–7 Likert. */
  declare value: number;
  /** Free-form context recorded with the answer — for RQ3 this carries the
   *  respondent's experiment arm. */
  declare context: Record<string, unknown> | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare user?: NonAttribute<User>;

  static associate(models: Db) {
    SurveyResponse.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  }
}

export const initSurveyResponse = (sequelize: Sequelize) => {
  SurveyResponse.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      promptKey: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      value: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 7 },
      },
      context: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'SurveyResponse',
    },
  );
  return SurveyResponse;
};
