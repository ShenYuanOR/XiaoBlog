import astro from 'eslint-plugin-astro';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const rootDir = import.meta.dirname;

function withRoot(configs) {
  return configs.map((config) => ({
    ...config,
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        ...config.languageOptions?.parserOptions,
        tsconfigRootDir: rootDir,
      },
    },
  }));
}

export default defineConfig(
  globalIgnores([
    'node_modules/**',
    '**/dist/**',
    '**/out/**',
    '**/release/**',
    '**/.astro/**',
    '**/.xiao-loc-order.json',
    '**/resources/staged/**',
    'docs/**',
    'public/**',
    'scripts/**',
    'redirects/**',
    '.vitepress/**',
    '.agents/**',
    'coverage/**',
    'packages/core/src/markdown/corpus/**',
    '**/*.vue',
  ]),
  ...withRoot(tseslint.configs.recommended),
  ...withRoot(astro.configs.recommended),
);
