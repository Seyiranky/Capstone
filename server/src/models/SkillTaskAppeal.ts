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
import type { AppealStatus } from '../types/domain';
import type { SkillTask } from './SkillTask';
import type { User } from './User';

/** A worker's recourse against a reviewer acting in bad faith. Upholding one
 *  reassigns the task while excluding everyone who has already seen it. */
export class SkillTaskAppeal extends Model<
  InferAttributes<SkillTaskAppeal>,
  InferCreationAttributes<SkillTaskAppeal>
> {
  declare id: CreationOptional<string>;
  declare taskId: string;
  declare workerId: string;
  declare reason: string;
  declare status: CreationOptional<AppealStatus>;
  declare resolutionNotes: string | null;
  declare decidedBy: string | null;
  declare decidedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare task?: NonAttribute<SkillTask>;
  declare worker?: NonAttribute<User>;
  declare decider?: NonAttribute<User | null>;

  static associate(models: Db) {
    SkillTaskAppeal.belongsTo(models.SkillTask, { foreignKey: 'taskId', as: 'task' });
    SkillTaskAppeal.belongsTo(models.User, { foreignKey: 'workerId', as: 'worker' });
    SkillTaskAppeal.belongsTo(models.User, { foreignKey: 'decidedBy', as: 'decider' });
  }
}

export const initSkillTaskAppeal = (sequelize: Sequelize) => {
  SkillTaskAppeal.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      taskId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      workerId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'open',
        validate: { isIn: [['open', 'upheld', 'dismissed']] },
      },
      resolutionNotes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      decidedBy: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      decidedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'SkillTaskAppeal',
    },
  );
  return SkillTaskAppeal;
};
