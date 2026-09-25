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
import type { ExperimentArm } from '../types/domain';
import type { User } from './User';

/**
 * One position in the pre-generated RQ3 allocation list.
 *
 * The sequence is drawn in permuted blocks of mixed size before the pilot
 * starts, so a researcher registering participants in person cannot deduce the
 * next arm from the ones already assigned. Rows are claimed under a row lock,
 * never invented.
 */
export class ExperimentAllocation extends Model<
  InferAttributes<ExperimentAllocation>,
  InferCreationAttributes<ExperimentAllocation>
> {
  declare id: CreationOptional<string>;
  declare experiment: CreationOptional<string>;
  declare position: number;
  declare blockIndex: number;
  declare blockSize: number;
  declare arm: ExperimentArm;
  declare seed: string;
  declare claimedByUserId: string | null;
  declare claimedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare claimedBy?: NonAttribute<User | null>;

  static associate(models: Db) {
    ExperimentAllocation.belongsTo(models.User, {
      foreignKey: 'claimedByUserId',
      as: 'claimedBy',
    });
  }
}

export const initExperimentAllocation = (sequelize: Sequelize) => {
  ExperimentAllocation.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      experiment: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'rq3_provenance',
      },
      position: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      blockIndex: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      blockSize: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      arm: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      seed: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      claimedByUserId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      claimedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'ExperimentAllocation',
    },
  );
  return ExperimentAllocation;
};
