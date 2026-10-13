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

export const REPORT_REASONS = ['payment_outside', 'fake_profile', 'no_show', 'harassment', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportStatus = 'open' | 'actioned' | 'dismissed';

/** One user telling the admins about another. */
export class Report extends Model<InferAttributes<Report>, InferCreationAttributes<Report>> {
  declare id: CreationOptional<string>;
  declare reporterId: string;
  declare reportedUserId: string;
  declare reason: ReportReason;
  declare note: string | null;
  declare status: CreationOptional<ReportStatus>;
  declare resolvedBy: string | null;
  declare resolvedAt: Date | null;
  declare resolutionNote: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare reporter?: NonAttribute<User>;
  declare reportedUser?: NonAttribute<User>;

  static associate(models: Db) {
    Report.belongsTo(models.User, { foreignKey: 'reporterId', as: 'reporter' });
    Report.belongsTo(models.User, { foreignKey: 'reportedUserId', as: 'reportedUser' });
  }
}

export const initReport = (sequelize: Sequelize) => {
  Report.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      reporterId: { type: DataTypes.UUID, allowNull: false },
      reportedUserId: { type: DataTypes.UUID, allowNull: false },
      reason: { type: DataTypes.STRING, allowNull: false, validate: { isIn: [REPORT_REASONS as unknown as string[]] } },
      note: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'open',
        validate: { isIn: [['open', 'actioned', 'dismissed']] },
      },
      resolvedBy: { type: DataTypes.UUID, allowNull: true },
      resolvedAt: { type: DataTypes.DATE, allowNull: true },
      resolutionNote: { type: DataTypes.TEXT, allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'Report' },
  );
  return Report;
};
