import astro from 'eslint-plugin-astro';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/**', '.astro/**']),
  tseslint.configs.recommended,
  astro.configs.recommended,
);
