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
import type { SkillCategory, SkillKind } from '../types/domain';
import type { Gig } from './Gig';
import type { SkillTask } from './SkillTask';
import type { UserSkill } from './UserSkill';

export class Skill extends Model<InferAttributes<Skill>, InferCreationAttributes<Skill>> {
  declare id: CreationOptional<string>;
  declare category: SkillCategory;
  declare name: string;
  declare description: string | null;
  declare parentId: string | null;
  declare kind: CreationOptional<SkillKind>;
  declare sortOrder: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userSkills?: NonAttribute<UserSkill[]>;
  declare tasks?: NonAttribute<SkillTask[]>;
  declare gigs?: NonAttribute<Gig[]>;
  declare parent?: NonAttribute<Skill | null>;
  declare children?: NonAttribute<Skill[]>;

  static associate(models: Db) {
    Skill.hasMany(models.UserSkill, { foreignKey: 'skillId', as: 'userSkills' });
    Skill.hasMany(models.SkillTask, { foreignKey: 'skillId', as: 'tasks' });
    Skill.hasMany(models.Gig, { foreignKey: 'skillId', as: 'gigs' });
    Skill.belongsTo(models.Skill, { foreignKey: 'parentId', as: 'parent' });
    Skill.hasMany(models.Skill, { foreignKey: 'parentId', as: 'children' });
  }
}

export const initSkill = (sequelize: Sequelize) => {
  Skill.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      category: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['electronics_repair', 'tailoring', 'tutoring', 'digital_web']],
        },
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Null for a category, set for a specialisation beneath one. A
      // specialisation inherits its parent's `category`, so existing queries
      // that group or filter by category keep working.
      parentId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      kind: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'category',
        validate: { isIn: [['category', 'specialisation']] },
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Skill',
    },
  );
  return Skill;
};
