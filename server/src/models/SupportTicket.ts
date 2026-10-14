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
import type { SupportMessage } from './SupportMessage';

export const SUPPORT_CATEGORIES = ['payment', 'account', 'skills', 'job', 'safety', 'bug', 'other'] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];
export const SUPPORT_STATUSES = ['open', 'waiting_on_user', 'resolved', 'closed'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export const SUPPORT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];
export const SUPPORT_RELATED = ['match', 'transaction', 'skill_task'] as const;
export type SupportRelatedType = (typeof SUPPORT_RELATED)[number];

/** Where the person was when they asked: the page, browser and language. */
export interface SupportContext {
  path?: string;
  userAgent?: string;
  language?: string;
  screen?: string;
}

/**
 * One request for help: a conversation between one person and the Isoko team.
 *
 * A signed-out person has no userId; they are reached by email and follow the
 * ticket through a private link, whose token is stored only as a hash.
 */
export class SupportTicket extends Model<InferAttributes<SupportTicket>, InferCreationAttributes<SupportTicket>> {
  declare id: CreationOptional<string>;
  declare number: string;
  declare userId: string | null;
  declare guestName: CreationOptional<string | null>;
  declare guestEmail: CreationOptional<string | null>;
  declare guestTokenHash: CreationOptional<string | null>;
  declare category: SupportCategory;
  declare subject: string;
  declare status: CreationOptional<SupportStatus>;
  declare priority: CreationOptional<SupportPriority>;
  declare relatedType: CreationOptional<SupportRelatedType | null>;
  declare relatedId: CreationOptional<string | null>;
  declare context: CreationOptional<SupportContext | null>;
  declare assigneeId: CreationOptional<string | null>;
  /** Something from the team the person has not opened yet. */
  declare userUnread: CreationOptional<boolean>;
  /** Something from the person no admin has opened yet. */
  declare adminUnread: CreationOptional<boolean>;
  declare lastMessageAt: Date;
  declare firstResponseAt: CreationOptional<Date | null>;
  declare resolvedAt: CreationOptional<Date | null>;
  declare closedAt: CreationOptional<Date | null>;
  declare helpful: CreationOptional<boolean | null>;
  declare ratingComment: CreationOptional<string | null>;
  declare escalatedTo: CreationOptional<'dispute' | 'report' | null>;
  declare escalatedId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare user?: NonAttribute<User | null>;
  declare assignee?: NonAttribute<User | null>;
  declare messages?: NonAttribute<SupportMessage[]>;

  static associate(models: Db) {
    SupportTicket.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    SupportTicket.belongsTo(models.User, { foreignKey: 'assigneeId', as: 'assignee' });
    SupportTicket.hasMany(models.SupportMessage, { foreignKey: 'ticketId', as: 'messages' });
  }

  /** What the person who asked may see: no token hash, no assignee details. */
  forRequester(): Record<string, unknown> {
    const { guestTokenHash: _hash, assigneeId: _assignee, adminUnread: _seen, ...rest } = this.get({ plain: true }) as Record<
      string,
      unknown
    >;
    delete rest.assignee;
    return rest;
  }
}

export const initSupportTicket = (sequelize: Sequelize) => {
  SupportTicket.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      number: { type: DataTypes.STRING, allowNull: false, unique: true },
      userId: { type: DataTypes.UUID, allowNull: true },
      guestName: { type: DataTypes.STRING, allowNull: true },
      guestEmail: { type: DataTypes.STRING, allowNull: true, validate: { isEmail: true } },
      guestTokenHash: { type: DataTypes.STRING, allowNull: true, unique: true },
      category: { type: DataTypes.STRING, allowNull: false, validate: { isIn: [SUPPORT_CATEGORIES as unknown as string[]] } },
      subject: { type: DataTypes.STRING, allowNull: false, validate: { len: [1, 140] } },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'open',
        validate: { isIn: [SUPPORT_STATUSES as unknown as string[]] },
      },
      priority: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'normal',
        validate: { isIn: [SUPPORT_PRIORITIES as unknown as string[]] },
      },
      relatedType: { type: DataTypes.STRING, allowNull: true, validate: { isIn: [SUPPORT_RELATED as unknown as string[]] } },
      relatedId: { type: DataTypes.UUID, allowNull: true },
      context: { type: DataTypes.JSONB, allowNull: true },
      assigneeId: { type: DataTypes.UUID, allowNull: true },
      userUnread: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      adminUnread: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      lastMessageAt: { type: DataTypes.DATE, allowNull: false },
      firstResponseAt: { type: DataTypes.DATE, allowNull: true },
      resolvedAt: { type: DataTypes.DATE, allowNull: true },
      closedAt: { type: DataTypes.DATE, allowNull: true },
      helpful: { type: DataTypes.BOOLEAN, allowNull: true },
      ratingComment: { type: DataTypes.TEXT, allowNull: true },
      escalatedTo: { type: DataTypes.STRING, allowNull: true, validate: { isIn: [['dispute', 'report']] } },
      escalatedId: { type: DataTypes.UUID, allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'SupportTicket' },
  );
  return SupportTicket;
};
