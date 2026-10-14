import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import type { Db } from './index';

/**
 * An answer admins give often, in English and Kinyarwanda. `{{name}}` is
 * replaced with the person's first name when it is inserted into a reply.
 */
export class SupportSavedReply extends Model<
  InferAttributes<SupportSavedReply>,
  InferCreationAttributes<SupportSavedReply>
> {
  declare id: CreationOptional<string>;
  declare title: string;
  declare body: string;
  declare bodyRw: CreationOptional<string | null>;
  declare category: CreationOptional<string | null>;
  declare usageCount: CreationOptional<number>;
  declare createdBy: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static associate(_models: Db) {}
}

export const initSupportSavedReply = (sequelize: Sequelize) => {
  SupportSavedReply.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      title: { type: DataTypes.STRING, allowNull: false, validate: { len: [1, 80] } },
      body: { type: DataTypes.TEXT, allowNull: false, validate: { len: [1, 2000] } },
      bodyRw: { type: DataTypes.TEXT, allowNull: true },
      category: { type: DataTypes.STRING, allowNull: true },
      usageCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdBy: { type: DataTypes.UUID, allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'SupportSavedReply', tableName: 'SupportSavedReplies' },
  );
  return SupportSavedReply;
};
