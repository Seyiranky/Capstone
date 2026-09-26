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
