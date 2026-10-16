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
import type { GigStatus } from '../types/domain';
import type { GigApplication } from './GigApplication';
import type { Match } from './Match';
import type { Skill } from './Skill';
import type { User } from './User';

export class Gig extends Model<InferAttributes<Gig>, InferCreationAttributes<Gig>> {
  declare id: CreationOptional<string>;
  declare clientId: string;
  declare skillId: string;
  declare title: string;
  declare description: string;
  declare budget: number;
  declare locationLat: number;
  declare locationLng: number;
  declare status: CreationOptional<GigStatus>;
  declare imageUrl: string | null;
  /** The client describing the job aloud, beside the written description. */
  declare voiceNoteUrl: CreationOptional<string | null>;
  declare voiceNoteMimeType: CreationOptional<string | null>;
  declare voiceNoteDurationSec: CreationOptional<number | null>;
  declare openedAt: Date | null;
  declare requiredLevel: number | null;
  /** Involves children or working inside a home: applying needs a stronger record. */
  declare sensitive: CreationOptional<boolean>;
  /** Who marked it: the client, Isoko's keyword check, or an admin. */
  declare sensitiveBy: CreationOptional<'client' | 'keywords' | 'admin' | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare client?: NonAttribute<User>;
  declare skill?: NonAttribute<Skill>;
  declare matches?: NonAttribute<Match[]>;
  declare applications?: NonAttribute<GigApplication[]>;

  static associate(models: Db) {
    Gig.belongsTo(models.User, { foreignKey: 'clientId', as: 'client' });
    Gig.belongsTo(models.Skill, { foreignKey: 'skillId', as: 'skill' });
    Gig.hasMany(models.Match, { foreignKey: 'gigId', as: 'matches' });
    Gig.hasMany(models.GigApplication, { foreignKey: 'gigId', as: 'applications' });
  }
}

export const initGig = (sequelize: Sequelize) => {
  Gig.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      clientId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      skillId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      budget: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      locationLat: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      locationLng: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending_review',
        validate: {
          isIn: [['pending_review', 'open', 'matched', 'completed', 'cancelled', 'rejected']],
        },
      },
      imageUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      voiceNoteUrl: { type: DataTypes.STRING, allowNull: true },
      voiceNoteMimeType: { type: DataTypes.STRING, allowNull: true },
      voiceNoteDurationSec: { type: DataTypes.INTEGER, allowNull: true },
      openedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      // Optional. Scored as a soft penalty, never used to filter candidates.
      requiredLevel: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { min: 1, max: 5 },
      },
      sensitive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sensitiveBy: { type: DataTypes.STRING, allowNull: true, validate: { isIn: [['client', 'keywords', 'admin']] } },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Gig',
    },
  );
  return Gig;
};
