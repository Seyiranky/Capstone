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
import type {
  ExperimentArm,
  Language,
  PreferredChannel,
  ReviewerTier,
  Role,
  UserStatus,
} from '../types/domain';
import type { TrustBreakdown } from '../types/scoring';
import type { Gig } from './Gig';
import type { GigApplication } from './GigApplication';
import type { Match } from './Match';
import type { Message } from './Message';
import type { Notification } from './Notification';
import type { Review } from './Review';
import type { SkillTask } from './SkillTask';
import type { UserSkill } from './UserSkill';

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare email: string;
  declare passwordHash: string;
  declare role: Role;
  declare status: CreationOptional<UserStatus>;
  declare bio: string | null;
  declare locationLat: number | null;
  declare locationLng: number | null;
  declare trustScore: CreationOptional<number>;
  declare trustScoreBreakdown: TrustBreakdown | null;
  declare trustScoreUpdatedAt: Date | null;
  declare reviewCount: CreationOptional<number>;
  declare completedJobCount: CreationOptional<number>;
  declare abandonedJobCount: CreationOptional<number>;
  declare preferredLanguage: CreationOptional<Language>;
  declare experienceSummary: string | null;
  declare yearsExperience: number | null;
  declare cvUrl: string | null;
  declare certificateUrl: string | null;
  declare phone: string | null;
  declare phoneVerifiedAt: Date | null;
  declare phoneVerificationCodeHash: string | null;
  declare phoneVerificationExpiresAt: Date | null;
  declare phoneVerificationAttempts: CreationOptional<number>;
  declare preferredChannel: CreationOptional<PreferredChannel>;
  declare emailVerifiedAt: Date | null;
  declare emailVerificationToken: string | null;
  declare emailVerificationExpiresAt: Date | null;
  declare experimentArm: ExperimentArm | null;
  /** Someone the worker trusts, told by SMS when they arrive at and leave a job, and on an SOS. */
  declare trustedContactName: string | null;
  declare trustedContactPhone: string | null;
  /** Whether the worker is taking work. `away` keeps them off ranked shortlists. */
  declare availability: CreationOptional<'available' | 'busy' | 'away'>;
  /** When an away worker is back; after this date they count as available. */
  declare availableFrom: Date | null;
  /** Monthly earnings the worker is aiming for, in RWF. */
  declare monthlyGoal: number | null;
  /** Share of every payout set aside toward Ejo Heza, 0–20%. */
  declare savingsPercent: CreationOptional<number>;
  declare reviewerTier: ReviewerTier | null;
  declare resetToken: string | null;
  declare resetTokenExpiresAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Present only when eagerly loaded through an include.
  declare userSkills?: NonAttribute<UserSkill[]>;
  declare submittedTasks?: NonAttribute<SkillTask[]>;
  declare reviewedTasks?: NonAttribute<SkillTask[]>;
  declare postedGigs?: NonAttribute<Gig[]>;
  declare matches?: NonAttribute<Match[]>;
  declare reviewsGiven?: NonAttribute<Review[]>;
  declare reviewsReceived?: NonAttribute<Review[]>;
  declare sentMessages?: NonAttribute<Message[]>;
  declare receivedMessages?: NonAttribute<Message[]>;
  declare notifications?: NonAttribute<Notification[]>;
  declare gigApplications?: NonAttribute<GigApplication[]>;

  static associate(models: Db) {
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

/**
 * The shape a normal query actually returns.
 *
 * `defaultScope` strips passwordHash, resetToken and emailVerificationToken, so
 * on any unscoped read
 * those fields are typed present but absent at runtime. Reach for the
 * `withPassword` scope — see `userWithPassword()` — when you genuinely need the
 * hash, and use this type everywhere else.
 */
export type SafeUser = Omit<User, 'passwordHash' | 'resetToken' | 'emailVerificationToken'>;

/**
 * The only supported way to read the password hash.
 *
 * `.scope()` returns ModelStatic<Model> and erases the concrete model, so the
 * cast is unavoidable; keeping it in one place means it is not repeated at
 * every call site, and the name says why the scope is being used.
 */
export const userWithPassword = (): typeof User => User.scope('withPassword') as typeof User;

export const initUser = (sequelize: Sequelize) => {
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
      // Null until a code sent to `phone` is confirmed, and cleared whenever the
      // number changes. SMS delivery checks this -- see lib/notify.ts.
      phoneVerifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      phoneVerificationCodeHash: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      phoneVerificationExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      phoneVerificationAttempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      // Validated rather than a DataTypes.ENUM, matching preferredLanguage and
      // every other union in this schema: the validator is the runtime check
      // the TypeScript union cannot perform on a body arriving from the network.
      preferredChannel: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'none',
        validate: { isIn: [['none', 'email', 'sms']] },
      },
      // Null until the address is confirmed. Email delivery checks this, so an
      // unconfirmed address is never written to — see lib/notify.ts.
      emailVerifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      emailVerificationToken: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      emailVerificationExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      // Capability to review skill submissions, independent of `role`. 'peer'
      // reviewers are verified workers, which is what makes the pool large
      // enough for rotation to mean anything.
      // RQ3 between-subjects assignment: 'provenance' sees how each claim was
      // established, 'plain' sees only verified or not.
      experimentArm: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { isIn: [['provenance', 'plain']] },
      },
      trustedContactName: { type: DataTypes.STRING, allowNull: true },
      trustedContactPhone: { type: DataTypes.STRING, allowNull: true },
      availability: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'available',
        validate: { isIn: [['available', 'busy', 'away']] },
      },
      availableFrom: { type: DataTypes.DATE, allowNull: true },
      monthlyGoal: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0 } },
      savingsPercent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0, max: 20 } },
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
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'User',
      hooks: {
        // Admins are reviewers by default; without this a newly created admin
        // would be unable to review anything, since the route is gated on the
        // capability rather than the role.
        beforeCreate: (user: User) => {
          if (user.role === 'admin' && !user.reviewerTier) {
            user.reviewerTier = 'admin';
          }
        },
      },
      defaultScope: {
        // resetToken is a bearer credential for resetting a password, and
        // emailVerificationToken one for claiming an address — never serialize
        // either on a normal query. The phone code's hash goes with them: it is
        // six digits, so a leaked hash is a solved code. The matching
        // *ExpiresAt columns are harmless and stay visible, since the flows
        // need to read them back.
        attributes: {
          exclude: [
            'passwordHash',
            'resetToken',
            'emailVerificationToken',
            'phoneVerificationCodeHash',
          ],
        },
      },
      scopes: {
        withPassword: {
          // Excluding nothing, which is how this scope undoes defaultScope's
          // exclusion. Spelt as an empty exclude rather than an empty object
          // because Sequelize's types require one of include/exclude to be
          // present; the resulting query is the same.
          attributes: { exclude: [] },
        },
      },
    },
  );
  return User;
};
