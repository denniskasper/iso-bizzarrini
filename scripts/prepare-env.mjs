import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * A fresh clone should need one command. If there is no `.env`, start from the example — every
 * value in it points at the local Postgres from docker-compose.yml and at nothing real.
 */
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
const exampleFile = fileURLToPath(new URL('../.env.example', import.meta.url));

if (existsSync(envFile)) {
  process.stdout.write('.env is already there — leaving it alone.\n');
} else {
  copyFileSync(exampleFile, envFile);
  process.stdout.write('Created .env from .env.example.\n');
}
