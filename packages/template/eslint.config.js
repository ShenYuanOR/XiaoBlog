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
  globalIgnores(['dist/**', '.astro/**']),
  ...withRoot(tseslint.configs.recommended),
  ...withRoot(astro.configs.recommended),
);
