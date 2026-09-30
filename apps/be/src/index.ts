import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Search for .env in current dir, package root, and monorepo root
const potentialEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
];

for (const envPath of potentialEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

import { config } from './config/index.js';
import { appLogger } from './loaders/logger.js';
import { createServer } from './server.js';

const server = createServer();

server.listen(config.port, () => {
  appLogger.info(`
  ################################################
  🛡️  GGADDAK Decision Tracker API: ${config.port} 🛡️
  📦  Database: Prisma SQLite
  🤖  AI Provider: ${config.ai.provider}
  ################################################
  `);
});
