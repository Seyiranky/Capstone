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

/** A photo of finished work, attached by the worker to the job it came from. */
export class JobPhoto extends Model<InferAttributes<JobPhoto>, InferCreationAttributes<JobPhoto>> {
  declare id: CreationOptional<string>;
  declare matchId: string;
  declare url: string;
  declare mimeType: string;
  declare sizeBytes: number;
  /** Ties the photo on a profile to the exact bytes uploaded for the job. */
  declare sha256: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare match?: NonAttribute<Match>;

  static associate(models: Db) {
    JobPhoto.belongsTo(models.Match, { foreignKey: 'matchId', as: 'match' });
  }
}

export const initJobPhoto = (sequelize: Sequelize) => {
  JobPhoto.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      matchId: { type: DataTypes.UUID, allowNull: false },
      url: { type: DataTypes.STRING, allowNull: false },
      mimeType: { type: DataTypes.STRING, allowNull: false },
      sizeBytes: { type: DataTypes.INTEGER, allowNull: false },
      sha256: { type: DataTypes.STRING(64), allowNull: false },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'JobPhoto' },
  );
  return JobPhoto;
};
