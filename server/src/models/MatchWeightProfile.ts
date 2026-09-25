import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

/**
 * A named set of ranking weights — the RQ2 comparison arms.
 *
 * `weights` is deliberately open-ended rather than a closed record: a profile
 * may carry a key this version of the scorer does not compute, and the scorer
 * drops it rather than contributing NaN to every total. Switching the active
 * profile re-ranks every candidate list, which is the experiment.
 */
export class MatchWeightProfile extends Model<
  InferAttributes<MatchWeightProfile>,
  InferCreationAttributes<MatchWeightProfile>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare weights: Record<string, number>;
  declare distanceHalfLifeKm: CreationOptional<number>;
  declare maxDistanceKm: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export const initMatchWeightProfile = (sequelize: Sequelize) => {
  MatchWeightProfile.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      weights: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      distanceHalfLifeKm: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 3,
      },
      maxDistanceKm: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 15,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'MatchWeightProfile',
    },
  );
  return MatchWeightProfile;
};
