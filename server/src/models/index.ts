import { Sequelize, type Dialect, type Options } from 'sequelize';

import { ExperimentAllocation, initExperimentAllocation } from './ExperimentAllocation';
import { Gig, initGig } from './Gig';
import { GigApplication, initGigApplication } from './GigApplication';
import { IdempotencyKey, initIdempotencyKey } from './IdempotencyKey';
import { Match, initMatch } from './Match';
import { MatchWeightProfile, initMatchWeightProfile } from './MatchWeightProfile';
import { Message, initMessage } from './Message';
import { Notification, initNotification } from './Notification';
import { NotificationDelivery, initNotificationDelivery } from './NotificationDelivery';
import { Review, initReview } from './Review';
import { Skill, initSkill } from './Skill';
import { SkillPassport, initSkillPassport } from './SkillPassport';
import { SkillTask, initSkillTask } from './SkillTask';
import { SkillTaskAppeal, initSkillTaskAppeal } from './SkillTaskAppeal';
import { SkillTaskAssignment, initSkillTaskAssignment } from './SkillTaskAssignment';
import { SkillTaskEvidence, initSkillTaskEvidence } from './SkillTaskEvidence';
import { SurveyResponse, initSurveyResponse } from './SurveyResponse';
import { Transaction, initTransaction } from './Transaction';
import { TrustScoreSnapshot, initTrustScoreSnapshot } from './TrustScoreSnapshot';
import { User, initUser } from './User';
import { UserSkill, initUserSkill } from './UserSkill';

/**
 * The model registry, listed rather than discovered.
 *
 * What stood here before was the stock sequelize-cli loader: readdirSync over
 * this directory, require each file, key the results into a bare `{}`. That
 * object had no type, so every `const { User } = require('../models')` across
 * the codebase resolved to `any` and a mistyped attribute was a runtime
 * undefined — a worker silently scored as though a field were absent. Naming
 * each model here is what makes the rest of the migration worth anything.
 *
 * It also removes a latent hazard: that loader matched on `.slice(-3) === '.js'`
 * and would happily have required compiled output back out of dist/.
 */

// config/ lives outside src/ because sequelize-cli loads it by path and cannot
// read TypeScript. One file configures both the CLI and the application, so
// the two cannot drift.
/** One environment's entry in config/config.js. */
interface DbConfig extends Options {
  dialect: Dialect;
  /** Production reads a single connection string instead of discrete fields. */
  use_env_variable?: string;
}

// config.js sits outside the TypeScript program — sequelize-cli loads it by
// path and cannot read TypeScript — so it cannot be imported as a typed module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const configs = require('../../config/config.js') as Record<string, DbConfig | undefined>;

const env = process.env.NODE_ENV || 'development';
const config = configs[env];

if (!config) {
  throw new Error(`No database configuration for NODE_ENV=${env} in config/config.js`);
}

const connectionString = config.use_env_variable
  ? process.env[config.use_env_variable]
  : undefined;

if (config.use_env_variable && !connectionString) {
  throw new Error(
    `config/config.js for ${env} expects ${config.use_env_variable} to hold the database URL, but it is unset.`,
  );
}

export const sequelize = connectionString
  ? new Sequelize(connectionString, config)
  : new Sequelize(config.database as string, config.username as string, config.password, config);

initExperimentAllocation(sequelize);
initGig(sequelize);
initGigApplication(sequelize);
initIdempotencyKey(sequelize);
initMatch(sequelize);
initMatchWeightProfile(sequelize);
initMessage(sequelize);
initNotification(sequelize);
initNotificationDelivery(sequelize);
initReview(sequelize);
initSkill(sequelize);
initSkillPassport(sequelize);
initSkillTask(sequelize);
initSkillTaskAppeal(sequelize);
initSkillTaskAssignment(sequelize);
initSkillTaskEvidence(sequelize);
initSurveyResponse(sequelize);
initTransaction(sequelize);
initTrustScoreSnapshot(sequelize);
initUser(sequelize);
initUserSkill(sequelize);

/** Every model, keyed by name. `associate` receives this. */
export const models = {
  ExperimentAllocation,
  Gig,
  GigApplication,
  IdempotencyKey,
  Match,
  MatchWeightProfile,
  Message,
  Notification,
  NotificationDelivery,
  Review,
  Skill,
  SkillPassport,
  SkillTask,
  SkillTaskAppeal,
  SkillTaskAssignment,
  SkillTaskEvidence,
  SurveyResponse,
  Transaction,
  TrustScoreSnapshot,
  User,
  UserSkill,
};

export type Db = typeof models;

// Associations are wired only once every model is initialised, exactly as the
// old loader did in its second pass.
for (const model of Object.values(models)) {
  const withAssociate = model as { associate?: (db: Db) => void };
  if (typeof withAssociate.associate === 'function') {
    withAssociate.associate(models);
  }
}

export {
  ExperimentAllocation,
  Gig,
  GigApplication,
  IdempotencyKey,
  Match,
  MatchWeightProfile,
  Message,
  Notification,
  NotificationDelivery,
  Review,
  Skill,
  SkillPassport,
  SkillTask,
  SkillTaskAppeal,
  SkillTaskAssignment,
  SkillTaskEvidence,
  SurveyResponse,
  Transaction,
  TrustScoreSnapshot,
  User,
  UserSkill,
  Sequelize,
};

/**
 * A default export shaped like the old loader's, for the `const db =
 * require('../models')` call sites that reach for `db.sequelize` or index a
 * model off the whole object.
 *
 * Note there is no `module.exports = db` here. Under CommonJS output the named
 * exports above already compile to properties on `exports`, so destructuring
 * and whole-object requires both work; assigning module.exports afterwards
 * would replace that object and silently wipe every one of them.
 */
const db = { ...models, sequelize, Sequelize };

export default db;
