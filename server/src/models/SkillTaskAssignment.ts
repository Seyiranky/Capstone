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
import type { AssignmentStatus } from '../types/domain';
import type { SkillTask } from './SkillTask';
import type { User } from './User';

export class SkillTaskAssignment extends Model<
  InferAttributes<SkillTaskAssignment>,
  InferCreationAttributes<SkillTaskAssignment>
> {
  declare id: CreationOptional<string>;
  declare taskId: string;
  declare reviewerId: string;
  declare round: CreationOptional<number>;
  declare status: CreationOptional<AssignmentStatus>;
  /** 1–5, self-reported by the reviewer. A low score escalates to a quorum. */
  declare confidence: number | null;
  declare notes: string | null;
  /** The seed the draw was made with, stored so any allocation in the pilot
   *  can be reproduced and defended. */
  declare assignmentSeed: string | null;
  declare eligiblePoolSize: number | null;
  declare assignedAt: CreationOptional<Date>;
  declare decidedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare task?: NonAttribute<SkillTask>;
  declare reviewer?: NonAttribute<User>;

  static associate(models: Db) {
    SkillTaskAssignment.belongsTo(models.SkillTask, { foreignKey: 'taskId', as: 'task' });
    SkillTaskAssignment.belongsTo(models.User, { foreignKey: 'reviewerId', as: 'reviewer' });
  }
}

export const initSkillTaskAssignment = (sequelize: Sequelize) => {
  SkillTaskAssignment.init(
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
      reviewerId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      round: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
        validate: { isIn: [['pending', 'approved', 'rejected', 'recused', 'expired']] },
      },
      confidence: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { min: 1, max: 5 },
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      assignmentSeed: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      eligiblePoolSize: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      assignedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
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
      modelName: 'SkillTaskAssignment',
    },
  );
  return SkillTaskAssignment;
};
