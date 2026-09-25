import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

/**
 * A claimed request key, so a repeat produces one effect and one answer.
 *
 * The key is claimed by a unique insert, which is why two simultaneous
 * arrivals race at the database rather than in application code.
 */
export class IdempotencyKey extends Model<
  InferAttributes<IdempotencyKey>,
  InferCreationAttributes<IdempotencyKey>
> {
  declare id: CreationOptional<string>;
  declare key: string;
  declare scope: string;
  declare statusCode: number | null;
  /** Whatever the original handler answered. Any controller's response can
   *  land here, so it is not narrowed beyond a JSON object. */
  declare responseBody: Record<string, unknown> | null;
  declare completedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export const initIdempotencyKey = (sequelize: Sequelize) => {
  IdempotencyKey.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      key: { type: DataTypes.STRING, allowNull: false },
      scope: { type: DataTypes.STRING, allowNull: false },
      statusCode: { type: DataTypes.INTEGER, allowNull: true },
      responseBody: { type: DataTypes.JSONB, allowNull: true },
      completedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: 'IdempotencyKey' },
  );
  return IdempotencyKey;
};
