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

/** `overdue` is raised by the sweep when a visit was never checked out of. */
export type SafetyEventKind = 'check_in' | 'check_out' | 'sos' | 'overdue';

/** One step of a safe visit: arriving, leaving, an SOS, or a visit that ran over. */
export class SafetyEvent extends Model<InferAttributes<SafetyEvent>, InferCreationAttributes<SafetyEvent>> {
  declare id: CreationOptional<string>;
  declare matchId: string;
  declare userId: string;
  declare kind: SafetyEventKind;
  declare lat: number | null;
  declare lng: number | null;
  /** Whether an SMS to the trusted contact was attempted and accepted. */
  declare contactNotified: CreationOptional<boolean>;
  /** For an SOS or overdue alert: when an admin marked it handled. */
  declare resolvedAt: Date | null;
  declare resolvedBy: string | null;
  /** When an admin said they were on it; the worker is told. */
  declare acknowledgedAt: CreationOptional<Date | null>;
  declare acknowledgedBy: CreationOptional<string | null>;
  /** What the admin did, written when the alert is closed. */
  declare resolutionNote: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare match?: NonAttribute<Match>;
  declare user?: NonAttribute<User>;

  static associate(models: Db) {
    SafetyEvent.belongsTo(models.Match, { foreignKey: 'matchId', as: 'match' });
    SafetyEvent.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    SafetyEvent.belongsTo(models.User, { foreignKey: 'acknowledgedBy', as: 'acknowledger' });
    SafetyEvent.belongsTo(models.User, { foreignKey: 'resolvedBy', as: 'resolver' });
  }
}

export const initSafetyEvent = (sequelize: Sequelize) => {
  SafetyEvent.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      matchId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      kind: { type: DataTypes.STRING, allowNull: false, validate: { isIn: [['check_in', 'check_out', 'sos', 'overdue']] } },
      lat: { type: DataTypes.DOUBLE, allowNull: true },
      lng: { type: DataTypes.DOUBLE, allowNull: true },
      contactNotified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      resolvedAt: { type: DataTypes.DATE, allowNull: true },
      resolvedBy: { type: DataTypes.UUID, allowNull: true },
      acknowledgedAt: { type: DataTypes.DATE, allowNull: true },
      acknowledgedBy: { type: DataTypes.UUID, allowNull: true },
      resolutionNote: { type: DataTypes.TEXT, allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'SafetyEvent' },
  );
  return SafetyEvent;
};
