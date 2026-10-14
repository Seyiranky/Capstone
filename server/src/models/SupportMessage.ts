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

export type SupportAuthorRole = 'user' | 'guest' | 'admin' | 'system';

/**
 * One entry in a support thread: a reply from the person or the team, an
 * internal note only admins see, or a system event such as "reopened".
 *
 * System events carry a key and values rather than finished text, so each
 * reader sees them in their own language.
 */
export class SupportMessage extends Model<InferAttributes<SupportMessage>, InferCreationAttributes<SupportMessage>> {
  declare id: CreationOptional<string>;
  declare ticketId: string;
  declare authorId: string | null;
  declare authorRole: SupportAuthorRole;
  declare body: CreationOptional<string>;
  declare internal: CreationOptional<boolean>;
  declare systemKey: CreationOptional<string | null>;
  declare meta: CreationOptional<Record<string, unknown> | null>;
  declare attachmentUrl: CreationOptional<string | null>;
  declare attachmentMime: CreationOptional<string | null>;
  declare attachmentName: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare author?: NonAttribute<User | null>;

  static associate(models: Db) {
    SupportMessage.belongsTo(models.SupportTicket, { foreignKey: 'ticketId', as: 'ticket' });
    SupportMessage.belongsTo(models.User, { foreignKey: 'authorId', as: 'author' });
  }
}

export const initSupportMessage = (sequelize: Sequelize) => {
  SupportMessage.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      ticketId: { type: DataTypes.UUID, allowNull: false },
      authorId: { type: DataTypes.UUID, allowNull: true },
      authorRole: { type: DataTypes.STRING, allowNull: false, validate: { isIn: [['user', 'guest', 'admin', 'system']] } },
      body: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
      internal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      systemKey: { type: DataTypes.STRING, allowNull: true },
      meta: { type: DataTypes.JSONB, allowNull: true },
      attachmentUrl: { type: DataTypes.STRING, allowNull: true },
      attachmentMime: { type: DataTypes.STRING, allowNull: true },
      attachmentName: { type: DataTypes.STRING, allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'SupportMessage' },
  );
  return SupportMessage;
};
