'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Skill extends Model {
    static associate(models) {
      Skill.hasMany(models.UserSkill, { foreignKey: 'skillId', as: 'userSkills' });
      Skill.hasMany(models.SkillTask, { foreignKey: 'skillId', as: 'tasks' });
      Skill.hasMany(models.Gig, { foreignKey: 'skillId', as: 'gigs' });
      Skill.belongsTo(models.Skill, { foreignKey: 'parentId', as: 'parent' });
      Skill.hasMany(models.Skill, { foreignKey: 'parentId', as: 'children' });
    }
  }
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
    },
    {
      sequelize,
      modelName: 'Skill',
    },
  );
  return Skill;
};
