/**
 * Gives every demonstration account (@isoko.demo) a new password, so the
 * deployed site no longer accepts the published local default.
 *
 *   DEMO_PASSWORD='a long private passphrase' npm run demo:passwords
 *
 * Run it against the deployment's database (for example from the Render shell,
 * where DATABASE_URL and NODE_ENV=production are already set). Local installs
 * keep the seeded default, password123, which only ever exists on a developer's
 * machine. The new password is read from the environment and never printed.
 * Every open session for these accounts ends, because passwordChangedAt moves.
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import db from '../models';

const MIN_LENGTH = 12;

const main = async () => {
  const password = process.env.DEMO_PASSWORD ?? '';
  if (password.length < MIN_LENGTH || password === 'password123') {
    throw new Error(`Set DEMO_PASSWORD to a private passphrase of at least ${MIN_LENGTH} characters.`);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const [count] = await db.User.update(
    { passwordHash, passwordChangedAt: new Date() },
    { where: { email: { [Op.like]: '%@isoko.demo' }, status: { [Op.ne]: 'deleted' } } },
  );
  console.log(`Updated the password of ${count} demonstration accounts; their open sessions have ended.`);
  await db.sequelize.close();
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
