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
import type { MemberRole, MemberStatus } from '../types/domain';
import type { Match } from './Match';
import type { User } from './User';

/** Someone on a job besides its lead worker: a crew member or an apprentice. */
export class MatchMember extends Model<InferAttributes<MatchMember>, InferCreationAttributes<MatchMember>> {
  declare id: CreationOptional<string>;
  declare matchId: string;
  declare userId: string;
  declare role: MemberRole;
  /** Their share of what the job pays out; the lead keeps the rest. */
  declare sharePercent: number;
  declare status: CreationOptional<MemberStatus>;
  declare joinedAt: Date | null;
  /** The lead's verdict on an apprentice, once the job is paid. */
  declare endorsement: 'endorsed' | 'notEndorsed' | null;
  declare endorsementNote: string | null;
  declare endorsedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare match?: NonAttribute<Match>;
  declare user?: NonAttribute<User>;

  static associate(models: Db) {
    MatchMember.belongsTo(models.Match, { foreignKey: 'matchId', as: 'match' });
    MatchMember.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  }
}

export const initMatchMember = (sequelize: Sequelize) => {
  MatchMember.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      matchId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      role: { type: DataTypes.STRING, allowNull: false, validate: { isIn: [['crew', 'apprentice']] } },
      sharePercent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0, max: 90 } },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'invited',
        validate: { isIn: [['invited', 'joined', 'declined']] },
      },
      joinedAt: { type: DataTypes.DATE, allowNull: true },
      endorsement: { type: DataTypes.STRING, allowNull: true, validate: { isIn: [['endorsed', 'notEndorsed']] } },
      endorsementNote: { type: DataTypes.STRING(280), allowNull: true },
      endorsedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'MatchMember' },
  );
  return MatchMember;
};
