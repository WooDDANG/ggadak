import { defineConfig } from 'orval';

export default defineConfig({
  ggaddak: {
    input: '../be/src/api/docs/swagger.json',
    output: {
      // This directory contains generated output only; remove obsolete schemas on regeneration.
      clean: true,
      mode: 'split',
      target: 'src/api/generated/index.ts',
      schemas: 'src/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      override: { mutator: { path: './src/api/transport.ts', name: 'authenticatedClient' } },
    },
  },
});
