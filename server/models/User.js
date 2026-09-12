'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.hasMany(models.UserSkill, { foreignKey: 'userId', as: 'userSkills' });
      User.hasMany(models.SkillTask, { foreignKey: 'workerId', as: 'submittedTasks' });
      User.hasMany(models.SkillTask, { foreignKey: 'reviewerId', as: 'reviewedTasks' });
      User.hasMany(models.Gig, { foreignKey: 'clientId', as: 'postedGigs' });
      User.hasMany(models.Match, { foreignKey: 'workerId', as: 'matches' });
      User.hasMany(models.Review, { foreignKey: 'authorId', as: 'reviewsGiven' });
      User.hasMany(models.Review, { foreignKey: 'recipientId', as: 'reviewsReceived' });
      User.hasMany(models.Message, { foreignKey: 'senderId', as: 'sentMessages' });
      User.hasMany(models.Message, { foreignKey: 'recipientId', as: 'receivedMessages' });
      User.hasMany(models.Notification, { foreignKey: 'userId', as: 'notifications' });
      User.hasMany(models.GigApplication, { foreignKey: 'workerId', as: 'gigApplications' });
    }
  }
  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      role: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [['worker', 'client', 'admin']] },
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'active',
        validate: { isIn: [['active', 'suspended']] },
      },
      bio: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      locationLat: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      locationLng: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      trustScore: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
      },
      resetToken: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      resetTokenExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'User',
      defaultScope: {
        // resetToken is a bearer credential for resetting a password — never
        // serialize it on a normal query. resetTokenExpiresAt is harmless and
        // stays visible since the reset flow needs to read it back.
        attributes: { exclude: ['passwordHash', 'resetToken'] },
      },
      scopes: {
        withPassword: {
          attributes: {},
        },
      },
    },
  );
  return User;
};
