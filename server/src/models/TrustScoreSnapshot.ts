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
import type { TrustBreakdown } from '../types/scoring';
import type { User } from './User';

/** One recomputation of a trust score, kept so a score can be explained after
 *  the fact and so a formula change is visible in the record. */
export class TrustScoreSnapshot extends Model<
  InferAttributes<TrustScoreSnapshot>,
  InferCreationAttributes<TrustScoreSnapshot>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare score: number;
  /**
   * The whole breakdown, not merely its components — the column name predates
   * the shape. Same type as User.trustScoreBreakdown, because it is the same
   * object.
   */
  declare components: TrustBreakdown;
  declare formulaVersion: string;
  declare trigger: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare user?: NonAttribute<User>;

  static associate(models: Db) {
    TrustScoreSnapshot.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  }
}

export const initTrustScoreSnapshot = (sequelize: Sequelize) => {
  TrustScoreSnapshot.init(
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
      score: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      components: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      formulaVersion: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      trigger: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'TrustScoreSnapshot',
    },
  );
  return TrustScoreSnapshot;
};
