import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import storybook from 'eslint-plugin-storybook';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Storybook's own rules. The preset self-scopes to *.stories.* files, so it
  // cannot affect anything else in the app.
  ...storybook.configs['flat/recommended'],
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
    // Build output of `npm run build-storybook`.
    'storybook-static/**',
  ]),
]);

export default eslintConfig;
