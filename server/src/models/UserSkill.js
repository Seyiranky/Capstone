'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class UserSkill extends Model {
    static associate(models) {
      UserSkill.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
      UserSkill.belongsTo(models.Skill, { foreignKey: 'skillId', as: 'skill' });
    }
  }
  UserSkill.init(
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
      skillId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      proficiencyLevel: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        validate: { min: 1, max: 5 },
      },
      verificationStatus: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'unverified',
        validate: { isIn: [['unverified', 'pending', 'verified']] },
      },
      // How the claim was established, not merely whether it was. Ascending:
      // the worker said so, a reviewer sighted a document, a reviewer approved
      // a demonstration, or the work itself was completed and reviewed.
      provenance: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'self_declared',
        validate: { isIn: [['self_declared', 'document_sighted', 'peer_reviewed', 'work_earned']] },
      },
      provenanceDetail: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      credentialStrength: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0.15,
      },
      selfDeclaredAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'UserSkill',
    },
  );
  return UserSkill;
};
