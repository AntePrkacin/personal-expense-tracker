const { createRequire } = require('node:module');
const { TestEnvironment: NodeEnvironment } = require('jest-environment-node');

/**
 * The standard Node test environment plus one extra global: `__loadEsm`.
 *
 * Three of the backend's dependencies ship ESM only - `@tursodatabase/database`,
 * `@tursodatabase/sync` and `uuid`. Node loads them without complaint
 * (`require()` of ESM has been supported since v22.12, well below the version
 * in .nvmrc), but Jest's CommonJS runtime has its own module registry that
 * predates the feature and reports "Cannot use import statement outside a
 * module".
 *
 * The usual workarounds do not apply here. Transforming those packages is
 * impossible because the napi loader inside them uses `import.meta.url`, which
 * has no CommonJS equivalent, and calling `createRequire` from inside a test
 * does not help either: Jest replaces `node:module`, so the require it returns
 * is Jest's own and lands right back in the same registry.
 *
 * This file, by contrast, is loaded by Jest itself in the ordinary Node
 * context, so the `createRequire` above is the genuine one. The shims in
 * esm-shims/ call the global it installs, and the jest configs point the three
 * specifiers at those shims. Everything else - Drizzle included - keeps going
 * through Jest normally, so there is only ever one copy of it.
 */
module.exports = class EsmAwareNodeEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);

    const nodeRequire = createRequire(__filename);
    this.global.__loadEsm = (specifier) => nodeRequire(specifier);
  }
};
