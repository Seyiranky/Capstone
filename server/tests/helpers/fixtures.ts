/**
 * Asserts that a fixture the suite depends on actually exists.
 *
 * `findOne` and the services' `recalculate` both return null, and under strict
 * null checks the tests have to say why they expect a row. A bare `!` would
 * silence the compiler and then fail with "cannot read property of null" three
 * lines later; this fails immediately and names the thing that was missing —
 * usually a seed that did not run.
 */
export const must = <T>(value: T | null | undefined, what: string): T => {
  if (value === null || value === undefined) {
    throw new Error(
      `Test fixture missing: ${what}. Did "npm run migrate:test && npm run seed:test" run?`,
    );
  }
  return value;
};

/**
 * Waits for the delivery rows a notification produced.
 *
 * `notify` dispatches SMS and email without awaiting them, so that an HTTP
 * request never waits on a gateway. That is deliberate and worth keeping, which
 * means the rows appear shortly *after* notify resolves and an assertion made
 * straight away races them. Polling here is the cost of not making production
 * slower to suit the tests.
 */
export const waitForDeliveries = async <T>(
  find: () => Promise<T[]>,
  { expected = 1, tries = 40, intervalMs = 25 } = {},
): Promise<T[]> => {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const rows = await find();
    if (rows.length >= expected) {
      return rows;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `Timed out after ${tries * intervalMs}ms waiting for ${expected} delivery row(s)`,
  );
};
