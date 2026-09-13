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
      trustScoreBreakdown: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      trustScoreUpdatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      reviewCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      completedJobCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      abandonedJobCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      preferredLanguage: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'en',
        validate: { isIn: [['en', 'rw']] },
      },
      experienceSummary: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      yearsExperience: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { min: 0, max: 60 },
      },
      cvUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      certificateUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      smsNotificationsEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      emailNotificationsEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      // Capability to review skill submissions, independent of `role`. 'peer'
      // reviewers are verified workers, which is what makes the pool large
      // enough for rotation to mean anything.
      reviewerTier: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { isIn: [['admin', 'peer']] },
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
      hooks: {
        // Admins are reviewers by default; without this a newly created admin
        // would be unable to review anything, since the route is gated on the
        // capability rather than the role.
        beforeCreate: (user) => {
          if (user.role === 'admin' && !user.reviewerTier) {
            user.reviewerTier = 'admin';
          }
        },
      },
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
