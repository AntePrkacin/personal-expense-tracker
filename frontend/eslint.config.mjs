import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Generated from backend/openapi.json by `npm run api:types`. Not code
    // anyone can fix in response to a lint error - the same reason
    // next-env.d.ts is above it.
    'src/types/api.d.ts',
  ]),
]);

export default eslintConfig;
