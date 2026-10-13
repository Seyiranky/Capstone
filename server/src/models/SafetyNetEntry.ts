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
import type { Payout } from './Payout';

/**
 * One movement in a worker's safety net. `contribution` is a client's addition
 * to the pot, `withdrawal` the worker drawing on it, `ejoHeza` a share of a
 * payout set aside toward long-term savings. Amounts are always positive; the
 * kind says which way the money moved.
 */
export type SafetyNetKind = 'contribution' | 'withdrawal' | 'ejoHeza';

export class SafetyNetEntry extends Model<
  InferAttributes<SafetyNetEntry>,
  InferCreationAttributes<SafetyNetEntry>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare payoutId: string | null;
  declare kind: SafetyNetKind;
  declare amount: number | string;
  declare note: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare payout?: NonAttribute<Payout>;

  static associate(models: Db) {
    SafetyNetEntry.belongsTo(models.Payout, { foreignKey: 'payoutId', as: 'payout' });
  }
}

export const initSafetyNetEntry = (sequelize: Sequelize) => {
  SafetyNetEntry.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      payoutId: { type: DataTypes.UUID, allowNull: true },
      kind: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [['contribution', 'withdrawal', 'ejoHeza']] },
      },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      note: { type: DataTypes.STRING(280), allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'SafetyNetEntry' },
  );
  return SafetyNetEntry;
};
