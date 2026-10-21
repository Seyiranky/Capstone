/**
 * Checks DATABASE_URL before the production start migrates, and explains what
 * is wrong in plain words without ever printing the address (it holds the
 * database password).
 *
 * Found on the first Render deploy: a password containing ")", "/", "$" and "?"
 * cut the address short, so the driver looked for a host named "postgres", and
 * Node printed the whole address, password included, in a warning. And
 * Supabase's direct host is IPv6-only, which Render cannot reach.
 */
export const problemWith = (raw: string | undefined): string | null => {
  if (!raw) return 'DATABASE_URL is not set.';
  if (raw.includes('[YOUR-PASSWORD]')) {
    return 'DATABASE_URL still contains "[YOUR-PASSWORD]": put the database password in its place, without the brackets.';
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return (
      'DATABASE_URL is not a valid address. Usually the password contains characters such as @ # / ? $ ) % ' +
      'which must be encoded (@ is %40) or, simpler, reset it to letters and numbers only.'
    );
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    return 'DATABASE_URL must start with postgresql://';
  }
  // A password with "/" or "?" can still parse, as a path or query, leaving a
  // host that is not the database's.
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') {
    return (
      `DATABASE_URL points at a host named "${url.hostname}", which is not a database server. ` +
      'The password probably contains characters such as / ? # @ that must be encoded, or reset it to letters and numbers only.'
    );
  }
  if (/^db\.[a-z0-9]+\.supabase\.co$/.test(url.hostname)) {
    return (
      "DATABASE_URL is Supabase's direct connection, which only works over IPv6; this host connects over IPv4. " +
      'In Supabase use Connect › Session pooler (host like aws-0-<region>.pooler.supabase.com).'
    );
  }
  return null;
};

if (require.main === module) {
  const problem = problemWith(process.env.DATABASE_URL);
  if (problem) {
    console.error(`Cannot start: ${problem}`);
    process.exit(1);
  }
  console.log('DATABASE_URL looks right.');
}
