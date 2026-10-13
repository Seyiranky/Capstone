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
import type { EvidenceKind } from '../types/domain';
import type { SkillTask } from './SkillTask';

export class SkillTaskEvidence extends Model<
  InferAttributes<SkillTaskEvidence>,
  InferCreationAttributes<SkillTaskEvidence>
> {
  declare id: CreationOptional<string>;
  declare taskId: string;
  /** A JPEG can be a photo of work or a photo of a certificate, so the client
   *  states the kind explicitly rather than the server sniffing the mime type. */
  declare kind: EvidenceKind;
  declare url: string;
  declare mimeType: string | null;
  declare sizeBytes: number | null;
  declare durationSec: number | null;
  declare sha256: string | null;
  declare capturedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare task?: NonAttribute<SkillTask>;

  static associate(models: Db) {
    SkillTaskEvidence.belongsTo(models.SkillTask, { foreignKey: 'taskId', as: 'task' });
  }
}

export const initSkillTaskEvidence = (sequelize: Sequelize) => {
  SkillTaskEvidence.init(
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
      kind: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [['photo', 'video', 'voice', 'link', 'document']] },
      },
      // Uploaded evidence is private: read back as a signed, expiring link.
      url: {
        type: DataTypes.STRING,
        allowNull: false,
        get() {
          return signUpload(this.getDataValue('url')) as string;
        },
      },
      mimeType: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      sizeBytes: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      durationSec: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      sha256: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      capturedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'SkillTaskEvidence',
    },
  );
  return SkillTaskEvidence;
};
