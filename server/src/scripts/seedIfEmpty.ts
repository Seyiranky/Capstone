/**
 * Loads the demo data into a database that has no users yet, and does nothing
 * otherwise. Run by the production entrypoint on every start, so a fresh
 * hosted database is ready to sign in to without a shell (Render's free tier
 * has none), and a database already in use is never touched.
 *
 * Set SEED_DEMO_DATA=false to start empty instead.
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import path from 'path';
import { User, sequelize } from '../models';

const run = (command: string, args: string[]) =>
  execFileSync(command, args, { stdio: 'inherit', cwd: path.join(__dirname, '..', '..') });

const main = async () => {
  if (process.env.SEED_DEMO_DATA === 'false') {
    console.log('SEED_DEMO_DATA=false: not loading demo data.');
    return;
  }
  const users = await User.count();
  await sequelize.close();
  if (users > 0) {
    console.log(`Database already has ${users} users: demo data not loaded.`);
    return;
  }
  console.log('Empty database: loading demo data...');
  run('npx', ['sequelize-cli', 'db:seed:all']);
  // The same follow-ups `npm run seed` runs, from the compiled scripts.
  run('node', [path.join(__dirname, 'backfillTrustScores.js')]);
  run('node', [path.join(__dirname, 'enrolPeerReviewers.js')]);
  console.log('Demo data loaded.');
};

main().catch((err) => {
  console.error('Loading demo data failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
