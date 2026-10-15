import astro from 'eslint-plugin-astro';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    'node_modules/**',
    'dist/**',
    'docs/**',
    'public/**',
    'scripts/**',
    'redirects/**',
    '.vitepress/**',
    '.agents/**',
    'coverage/**',
  ]),
  tseslint.configs.recommended,
  astro.configs.recommended,
);
