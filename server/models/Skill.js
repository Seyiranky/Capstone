'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Skill extends Model {
    static associate(models) {
      Skill.hasMany(models.UserSkill, { foreignKey: 'skillId', as: 'userSkills' });
      Skill.hasMany(models.SkillTask, { foreignKey: 'skillId', as: 'tasks' });
      Skill.hasMany(models.Gig, { foreignKey: 'skillId', as: 'gigs' });
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
    },
    {
      sequelize,
      modelName: 'Skill',
    },
  );
  return Skill;
};
