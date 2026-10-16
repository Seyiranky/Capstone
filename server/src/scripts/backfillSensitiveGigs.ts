import 'dotenv/config';
import { Gig, sequelize } from '../models';
import { looksSensitive } from '../lib/sensitiveGig';

/**
 * Marks gigs posted before the sensitive flag existed, by the same keyword
 * check new gigs get. Only open or awaiting-approval gigs, and only ever sets
 * the flag: a gig someone has already marked or cleared is left alone.
 *
 *   npm run backfill:sensitive
 */
(async () => {
  const gigs = await Gig.findAll({ where: { status: ['open', 'pending_review'], sensitive: false, sensitiveBy: null } });
  const marked = gigs.filter((g) => looksSensitive(g.title, g.description));
  for (const g of marked) await g.update({ sensitive: true, sensitiveBy: 'keywords' });
  console.log(`Checked ${gigs.length} gigs; marked ${marked.length} sensitive${marked.length ? `: ${marked.map((g) => `"${g.title}"`).join(', ')}` : ''}.`);
  await sequelize.close();
})();
