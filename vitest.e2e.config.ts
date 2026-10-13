import { defineConfig } from 'vitest/config';
import { backendTypescript } from './tooling/vitest-typescript.js';

export default defineConfig({
  plugins: [backendTypescript()],
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    setupFiles: ['reflect-metadata', './apps/be/tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
