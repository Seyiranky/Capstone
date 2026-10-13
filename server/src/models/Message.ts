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

export class Message extends Model<InferAttributes<Message>, InferCreationAttributes<Message>> {
  declare id: CreationOptional<string>;
  declare senderId: string;
  declare recipientId: string;
  declare body: CreationOptional<string>;
  /** A photo sent with (or instead of) text. Served from /uploads by an unguessable name. */
  declare imageUrl: string | null;
  declare imageMimeType: string | null;
  declare imageSha256: string | null;
  /** A voice note, sent instead of (or with) text. Duration is as the sender's device recorded it. */
  declare audioUrl: CreationOptional<string | null>;
  declare audioMimeType: CreationOptional<string | null>;
  declare audioDurationSec: CreationOptional<number | null>;
  declare readAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sender?: NonAttribute<User>;
  declare recipient?: NonAttribute<User>;

  static associate(models: Db) {
    Message.belongsTo(models.User, { foreignKey: 'senderId', as: 'sender' });
    Message.belongsTo(models.User, { foreignKey: 'recipientId', as: 'recipient' });
  }
}

export const initMessage = (sequelize: Sequelize) => {
  Message.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      senderId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      recipientId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '',
      },
      imageUrl: { type: DataTypes.STRING, allowNull: true },
      imageMimeType: { type: DataTypes.STRING, allowNull: true },
      imageSha256: { type: DataTypes.STRING(64), allowNull: true },
      audioUrl: { type: DataTypes.STRING, allowNull: true },
      audioMimeType: { type: DataTypes.STRING, allowNull: true },
      audioDurationSec: { type: DataTypes.INTEGER, allowNull: true },
      readAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Message',
    },
  );
  return Message;
};
