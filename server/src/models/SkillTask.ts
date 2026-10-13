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
import { signUpload } from '../lib/signedUploads';
import type { SkillTaskKind, SkillTaskStatus } from '../types/domain';
import type { Skill } from './Skill';
import type { SkillTaskAppeal } from './SkillTaskAppeal';
import type { SkillTaskAssignment } from './SkillTaskAssignment';
import type { SkillTaskEvidence } from './SkillTaskEvidence';
import type { User } from './User';

/** A certificate's claim, as the worker stated it. Never authenticated — only
 *  sighted by a reviewer the worker could not choose. */
export interface SkillTaskClaim {
  title: string;
  issuer: string;
  issuedOn?: string | null;
}

export class SkillTask extends Model<
  InferAttributes<SkillTask>,
  InferCreationAttributes<SkillTask>
> {
  declare id: CreationOptional<string>;
  declare workerId: string;
  declare skillId: string;
  declare reviewerId: string | null;
  declare evidenceUrl: string;
  declare notes: string | null;
  declare status: CreationOptional<SkillTaskStatus>;
  declare reviewedAt: Date | null;
  /** One column is what makes a certificate inherit the whole rotation. */
  declare kind: CreationOptional<SkillTaskKind>;
  declare claim: SkillTaskClaim | null;
  declare requiredApprovals: CreationOptional<number>;
  declare disagreementFlag: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare worker?: NonAttribute<User>;
  declare reviewer?: NonAttribute<User | null>;
  declare skill?: NonAttribute<Skill>;
  declare assignments?: NonAttribute<SkillTaskAssignment[]>;
  declare appeal?: NonAttribute<SkillTaskAppeal | null>;
  declare evidence?: NonAttribute<SkillTaskEvidence[]>;

  static associate(models: Db) {
    SkillTask.belongsTo(models.User, { foreignKey: 'workerId', as: 'worker' });
    SkillTask.belongsTo(models.User, { foreignKey: 'reviewerId', as: 'reviewer' });
    SkillTask.belongsTo(models.Skill, { foreignKey: 'skillId', as: 'skill' });
    SkillTask.hasMany(models.SkillTaskAssignment, { foreignKey: 'taskId', as: 'assignments' });
    SkillTask.hasOne(models.SkillTaskAppeal, { foreignKey: 'taskId', as: 'appeal' });
    SkillTask.hasMany(models.SkillTaskEvidence, { foreignKey: 'taskId', as: 'evidence' });
  }
}

export const initSkillTask = (sequelize: Sequelize) => {
  SkillTask.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      workerId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      skillId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      reviewerId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      // Uploaded evidence is private: read back as a signed, expiring link.
      evidenceUrl: {
        type: DataTypes.STRING,
        allowNull: false,
        get() {
          return signUpload(this.getDataValue('evidenceUrl')) as string;
        },
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
        validate: { isIn: [['pending', 'approved', 'rejected']] },
      },
      reviewedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      kind: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'demonstration',
        validate: { isIn: [['demonstration', 'certificate']] },
      },
      claim: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      requiredApprovals: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      disagreementFlag: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'SkillTask',
    },
  );
  return SkillTask;
};
