/**
 * The shape of the thing built: tables, API operations and committed
 * migrations.
 *
 * Every figure here is read out of a **committed artifact** rather than out of a
 * running system, which is what makes them reproducible on any checkout with no
 * database, no server and no network. The tables come from the two schema files,
 * the operations from the generated OpenAPI document that CI already fails on
 * when it drifts, and the migrations from the directories on disk.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, writeData } from './lib.mjs';

const SCHEMAS = [
  { scope: 'central', path: 'backend/src/database/central/schema.ts' },
  { scope: 'user', path: 'backend/src/database/user/schema.ts' },
];

/**
 * Tables, by counting `sqliteTable(` declarations.
 *
 * A regex over the schema rather than importing it: the schema imports the
 * drizzle runtime, and a statistics generator that needs `backend/node_modules`
 * installed is one that cannot run on a fresh clone minutes before a talk.
 */
function tables() {
  return SCHEMAS.map(({ scope, path }) => {
    const source = readFileSync(join(REPO_ROOT, path), 'utf8');
    const matches = source.match(/sqliteTable\(/g) ?? [];
    return { scope, tables: matches.length };
  });
}

/**
 * Operations and the paths they sit on.
 *
 * An operation is one method on one path, so `GET /x` and `POST /x` are two
 * operations on one path - which is why both numbers are published: "29
 * operations across 22 paths" says something neither half says alone.
 */
function api() {
  const document = JSON.parse(
    readFileSync(join(REPO_ROOT, 'backend/openapi.json'), 'utf8'),
  );

  const METHODS = new Set([
    'get',
    'put',
    'post',
    'delete',
    'options',
    'head',
    'patch',
    'trace',
  ]);

  const paths = Object.keys(document.paths ?? {});
  let operations = 0;
  const byMethod = {};

  for (const path of paths) {
    for (const [method, operation] of Object.entries(document.paths[path])) {
      if (!METHODS.has(method) || !operation) {
        continue;
      }
      operations++;
      byMethod[method.toUpperCase()] =
        (byMethod[method.toUpperCase()] ?? 0) + 1;
    }
  }

  return { operations, paths: paths.length, byMethod };
}

/** One directory per migration, per scope. */
function migrations() {
  return SCHEMAS.map(({ scope }) => {
    const directory = join(REPO_ROOT, 'backend/drizzle', scope);
    let count = 0;
    try {
      count = readdirSync(directory, { withFileTypes: true }).filter((entry) =>
        entry.isDirectory(),
      ).length;
    } catch {
      count = 0;
    }
    return { scope, migrations: count };
  });
}

const tablesByScope = tables();
const migrationsByScope = migrations();

writeData('shape', {
  tables: {
    byScope: tablesByScope,
    total: tablesByScope.reduce((sum, scope) => sum + scope.tables, 0),
  },
  api: api(),
  migrations: {
    byScope: migrationsByScope,
    total: migrationsByScope.reduce((sum, scope) => sum + scope.migrations, 0),
  },
});
