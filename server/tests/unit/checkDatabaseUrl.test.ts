import { problemWith } from '../../src/scripts/checkDatabaseUrl';

describe('checking DATABASE_URL before migrating', () => {
  test('a pooler address with a plain password is fine', () => {
    expect(problemWith('postgresql://postgres.abcd:Letters123@aws-0-eu-central-1.pooler.supabase.com:5432/postgres')).toBeNull();
    expect(problemWith('postgres://isoko:isoko@localhost:5432/isoko')).toBeNull();
  });

  test('the placeholder left in is caught', () => {
    expect(problemWith('postgresql://postgres.abcd:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres')).toMatch(/YOUR-PASSWORD/);
  });

  test('a password with unencoded characters is caught, and never echoed', () => {
    const secret = 'pa))ss/wo$?rd';
    const problem = problemWith(`postgresql://postgres:${secret}@db.abcd.supabase.co:5432/postgres`);
    expect(problem).toMatch(/encoded|letters and numbers/);
    expect(problem).not.toContain(secret);
    expect(problem).not.toContain('pa))ss');
  });

  test("Supabase's direct (IPv6-only) host is caught", () => {
    expect(problemWith('postgresql://postgres:Letters123@db.abcd.supabase.co:5432/postgres')).toMatch(/Session pooler/);
  });

  test('unset is caught', () => {
    expect(problemWith(undefined)).toMatch(/not set/);
  });
});
