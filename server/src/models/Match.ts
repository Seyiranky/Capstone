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
import type { CompletionMethod, InvitationReason, MatchOrigin, MatchStatus } from '../types/domain';
import type { ScoredPair } from '../types/scoring';
import type { Gig } from './Gig';
import type { Review } from './Review';
import type { Dispute } from './Dispute';
import type { JobPhoto } from './JobPhoto';
import type { MatchMember } from './MatchMember';
import type { Payout } from './Payout';
import type { Transaction } from './Transaction';
import type { User } from './User';

export class Match extends Model<InferAttributes<Match>, InferCreationAttributes<Match>> {
  declare id: CreationOptional<string>;
  declare gigId: string;
  declare workerId: string;
  declare status: CreationOptional<MatchStatus>;
  declare rankScore: number | null;
  declare origin: CreationOptional<MatchOrigin>;
  declare respondedAt: Date | null;
  declare acceptedAt: Date | null;
  declare respondedOccurredAt: Date | null;
  declare wasQueuedOffline: CreationOptional<boolean>;
  declare declineReason: string | null;
  /** Written verbatim from matchScoringService.scorePair — see types/scoring. */
  declare scoreBreakdown: ScoredPair | null;
  declare weightProfileId: string | null;
  declare invitationReason: InvitationReason | null;
  /** Handed over by the client on site; entering it completes the job and
   *  releases escrow. Excluded by the default scope so it never reaches the
   *  worker it is meant to be collected from. */
  declare completionCode: string | null;
  declare completionCodeAttempts: CreationOptional<number>;
  declare workDoneAt: Date | null;
  declare completedVia: CompletionMethod | null;
  /** The accepted quote, which escrow collects. Null means the gig's budget. */
  declare agreedAmount: number | string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare gig?: NonAttribute<Gig>;
  declare worker?: NonAttribute<User>;
  declare transaction?: NonAttribute<Transaction | null>;
  declare reviews?: NonAttribute<Review[]>;
  declare disputes?: NonAttribute<Dispute[]>;
  declare photos?: NonAttribute<JobPhoto[]>;
  declare members?: NonAttribute<MatchMember[]>;
  declare payouts?: NonAttribute<Payout[]>;

  static associate(models: Db) {
    Match.belongsTo(models.Gig, { foreignKey: 'gigId', as: 'gig' });
    Match.belongsTo(models.User, { foreignKey: 'workerId', as: 'worker' });
    Match.hasOne(models.Transaction, { foreignKey: 'matchId', as: 'transaction' });
    Match.hasMany(models.Review, { foreignKey: 'matchId', as: 'reviews' });
    Match.hasMany(models.Dispute, { foreignKey: 'matchId', as: 'disputes' });
    Match.hasMany(models.JobPhoto, { foreignKey: 'matchId', as: 'photos' });
    Match.hasMany(models.MatchMember, { foreignKey: 'matchId', as: 'members' });
    Match.hasMany(models.Payout, { foreignKey: 'matchId', as: 'payouts' });
  }
}

export const initMatch = (sequelize: Sequelize) => {
  Match.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      gigId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      workerId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
        validate: { isIn: [['pending', 'accepted', 'completed', 'cancelled']] },
      },
      rankScore: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      origin: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'manual',
        validate: { isIn: [['manual', 'ranked']] },
      },
      respondedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      acceptedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      // When the worker actually acted, as opposed to when the server heard
      // about it. These differ whenever an action was taken offline.
      respondedOccurredAt: { type: DataTypes.DATE, allowNull: true },
      wasQueuedOffline: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      declineReason: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      scoreBreakdown: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      weightProfileId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      // 'exploration' marks an invitation a newcomer received because a slot
      // was reserved, not because the ranking put them there.
      invitationReason: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { isIn: [['ranked', 'exploration']] },
      },
      completionCode: { type: DataTypes.STRING(4), allowNull: true },
      agreedAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      completionCodeAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      workDoneAt: { type: DataTypes.DATE, allowNull: true },
      completedVia: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { isIn: [['code', 'client', 'auto', 'dispute']] },
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Match',
      // The code is a handover secret between client and worker. Leaving it out
      // by default means no include anywhere (gig listings, transactions,
      // admin views) can leak it; the one place that needs it asks explicitly.
      defaultScope: { attributes: { exclude: ['completionCode'] } },
      scopes: { withCompletionCode: { attributes: { include: ['completionCode'] } } },
    },
  );
  return Match;
};
