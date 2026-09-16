import 'reflect-metadata';
import { createApp } from './bootstrap';
import { readConfig } from './config';
async function main() {
  const app = await createApp();
  await app.listen(readConfig().PORT, '0.0.0.0');
}
main().catch(() => { console.error('API startup failed. Check environment and database availability.'); process.exitCode = 1; });
