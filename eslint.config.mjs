// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['dist/**', 'apps/*/dist/**', 'packages/*/dist/**', 'node_modules/**']
  },
  eslint.configs.recommended,
  tseslint.configs.strict,
  tseslint.configs.stylistic
);
