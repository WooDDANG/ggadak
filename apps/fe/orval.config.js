import { defineConfig } from 'orval';

export default defineConfig({
  ggaddak: {
    input: '../be/src/api/docs/swagger.json',
    output: {
      mode: 'split',
      target: 'src/api/generated/index.ts',
      schemas: 'src/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
    },
  },
});
