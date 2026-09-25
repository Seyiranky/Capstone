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
import type { GigApplicationStatus } from '../types/domain';
import type { ScoredPair } from '../types/scoring';
import type { Gig } from './Gig';
import type { User } from './User';

export class GigApplication extends Model<
  InferAttributes<GigApplication>,
  InferCreationAttributes<GigApplication>
> {
  declare id: CreationOptional<string>;
  declare gigId: string;
  declare workerId: string;
  declare status: CreationOptional<GigApplicationStatus>;
  declare rankScore: number | null;
  /** Written verbatim from matchScoringService.scoreOne — see types/scoring. */
  declare scoreBreakdown: ScoredPair | null;
  declare weightProfileId: string | null;
  /** When the worker applied, which differs from createdAt whenever the action
   *  was queued offline and replayed later. */
  declare occurredAt: Date | null;
  declare wasQueuedOffline: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare gig?: NonAttribute<Gig>;
  declare worker?: NonAttribute<User>;

  static associate(models: Db) {
    GigApplication.belongsTo(models.Gig, { foreignKey: 'gigId', as: 'gig' });
    GigApplication.belongsTo(models.User, { foreignKey: 'workerId', as: 'worker' });
  }
}

export const initGigApplication = (sequelize: Sequelize) => {
  GigApplication.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      gigId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      workerId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
        validate: { isIn: [['pending', 'approved', 'rejected']] },
      },
      rankScore: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      scoreBreakdown: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      weightProfileId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      occurredAt: { type: DataTypes.DATE, allowNull: true },
      wasQueuedOffline: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'GigApplication',
    },
  );
  return GigApplication;
};
