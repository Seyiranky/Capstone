import type { Request } from 'express';

/**
 * A query parameter, only if it really is a single string.
 *
 * Express parses `?id[]=a&id[]=b` into an array and `?id[x]=y` into an object,
 * so a query value is `string | ParsedQs | (string | ParsedQs)[]` rather than
 * the string the handlers assumed. Untyped, those shapes went straight into
 * Sequelize where-clauses; anything that is not a plain string is now rejected
 * at the edge, where a caller can be told the parameter was malformed.
 */
export const stringParam = (req: Request, name: string): string | null => {
  const value = req.query[name];
  return typeof value === 'string' ? value : null;
};

/**
 * A route parameter as a string.
 *
 * Express 5 types params as `string | string[]` because a wildcard segment can
 * repeat. Every route here uses named single segments like `:id`, so the array
 * case cannot arise; taking the first entry rather than stringifying the array
 * means a surprise never turns into the literal value "a,b" reaching a query.
 */
export const pathParam = (req: Request, name: string): string => {
  const value = req.params[name];
  return (Array.isArray(value) ? value[0] : value) ?? '';
};
