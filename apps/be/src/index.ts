import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Search for .env in current dir, package root, and monorepo root
const potentialEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env')
];

for (const envPath of potentialEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

import { createLogger } from '@ggaddak/shared';
import { createServer } from './server.js';
import { DecisionRepository } from './db.js';

const logger = createLogger('BE');
const PORT = process.env.BE_PORT || process.env.PORT ? parseInt((process.env.BE_PORT || process.env.PORT)!, 10) : 3001;
const DB_PATH = process.env.DATABASE_PATH || './decisions.sqlite';

const repo = new DecisionRepository(DB_PATH);
const server = createServer(repo);

server.listen(PORT, () => {
  logger.info(`Decision Tracker Backend API listening on http://localhost:${PORT}`);
  logger.info(`Database connected at: ${DB_PATH}`);
  logger.info(`AI Provider: ${process.env.AI_PROVIDER || 'gemini'} (API Key loaded: ${Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY)})`);
});
