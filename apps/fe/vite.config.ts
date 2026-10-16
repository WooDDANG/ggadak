import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('../../', import.meta.url));
  const env = loadEnv(mode, envDir, 'FE_');
  const port = Number(process.env.FE_PORT ?? env.FE_PORT ?? '3002');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid FE_PORT');
  return {
    envDir,
    plugins: [react()],
    server: {
      port,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
