import { defineConfig } from 'vitest/config';
import { backendTypescript } from './tooling/vitest-typescript.js';

export default defineConfig({
  plugins: [backendTypescript()],
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    setupFiles: ['reflect-metadata'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
