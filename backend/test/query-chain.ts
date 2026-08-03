import { SQLiteDialect } from 'drizzle-orm/sqlite-core';

interface RecordedCall {
  method: string;
  args: unknown[];
}

export interface QueryChain {
  __calls: RecordedCall[];
}

/**
 * Stands in for a Drizzle query builder in unit tests.
 *
 * Builders are chainable and thenable: the whole
 * `select().from().where().limit()` expression is awaited as one value. This
 * returns the same object from every method, records the arguments each one
 * received, and resolves to `result` when awaited - or rejects, if `result` is
 * an Error.
 *
 * Lives under test/ rather than src/ so it stays out of the build and out of
 * the coverage denominator; jest's moduleNameMapper already reaches across the
 * same boundary.
 */
export function queryChain(result: unknown): QueryChain {
  const calls: RecordedCall[] = [];

  const proxy = new Proxy({} as QueryChain, {
    get(_target, property) {
      if (property === '__calls') return calls;
      if (typeof property !== 'string') return undefined;
      if (property === 'then') {
        return (
          resolve: (v: unknown) => unknown,
          reject: (e: unknown) => unknown,
        ) =>
          result instanceof Error
            ? Promise.reject(result).then(resolve, reject)
            : Promise.resolve(result).then(resolve, reject);
      }
      return (...args: unknown[]) => {
        calls.push({ method: property, args });
        return proxy;
      };
    },
  });

  return proxy;
}

/** The arguments a chain received for one builder method, e.g. `values`. */
export const argsOf = (chain: QueryChain, method: string): unknown[] =>
  chain.__calls.find((call) => call.method === method)?.args ?? [];

/** Renders a Drizzle condition to SQL text, so filters can be asserted for real. */
export const toSql = (condition: unknown): string =>
  new SQLiteDialect().sqlToQuery(condition as never).sql;

/** The bound values of a Drizzle condition, in placeholder order. */
export const paramsOf = (condition: unknown): unknown[] =>
  new SQLiteDialect().sqlToQuery(condition as never).params;
