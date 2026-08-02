import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * On a laptop, configuration comes from `.env` at the repository root. In a container it comes
 * from the environment and there is no file — hence the existence check rather than a failure.
 * Values already in the environment always win.
 */
export function loadEnvFile(): void {
  const envFile = fileURLToPath(new URL('../../../../.env', import.meta.url));
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}
