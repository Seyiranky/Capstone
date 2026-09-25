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

/**
 * A shareable, signed statement of what a worker has verified.
 *
 * Only the token id is stored — never the token itself — so the row cannot be
 * used to impersonate the passport it identifies. Revocation is a timestamp
 * rather than a delete, because a verifier needs to be told a passport was
 * withdrawn, not merely that it is unknown.
 */
export class SkillPassport extends Model<
  InferAttributes<SkillPassport>,
  InferCreationAttributes<SkillPassport>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare tokenId: string;
  declare issuedAt: CreationOptional<Date>;
  declare revokedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare user?: NonAttribute<User>;

  static associate(models: Db) {
    SkillPassport.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  }
}

export const initSkillPassport = (sequelize: Sequelize) => {
  SkillPassport.init(
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
      tokenId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      issuedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'SkillPassport',
    },
  );
  return SkillPassport;
};
