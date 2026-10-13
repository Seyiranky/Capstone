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
import type { Provenance, VerificationStatus } from '../types/domain';
import type { ProvenanceDetail } from '../types/scoring';
import type { Skill } from './Skill';
import type { User } from './User';

export class UserSkill extends Model<
  InferAttributes<UserSkill>,
  InferCreationAttributes<UserSkill>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare skillId: string;
  declare proficiencyLevel: CreationOptional<number>;
  declare verificationStatus: CreationOptional<VerificationStatus>;
  declare provenance: CreationOptional<Provenance>;
  declare provenanceDetail: ProvenanceDetail | null;
  declare credentialStrength: CreationOptional<number>;
  declare selfDeclaredAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare user?: NonAttribute<User>;
  declare skill?: NonAttribute<Skill>;

  static associate(models: Db) {
    UserSkill.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    UserSkill.belongsTo(models.Skill, { foreignKey: 'skillId', as: 'skill' });
  }
}

export const initUserSkill = (sequelize: Sequelize) => {
  UserSkill.init(
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
      skillId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      proficiencyLevel: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        validate: { min: 1, max: 5 },
      },
      verificationStatus: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'unverified',
        validate: { isIn: [['unverified', 'pending', 'verified']] },
      },
      // How the claim was established, not merely whether it was. Ascending:
      // the worker said so, a reviewer sighted a document, a reviewer approved
      // a demonstration, or the work itself was completed and reviewed.
      provenance: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'self_declared',
        validate: { isIn: [['self_declared', 'supervised', 'document_sighted', 'peer_reviewed', 'work_earned']] },
      },
      provenanceDetail: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      credentialStrength: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0.15,
      },
      selfDeclaredAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'UserSkill',
    },
  );
  return UserSkill;
};
