import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 1, timeout: 30000,
  use: { baseURL: 'http://localhost:3000', browserName: 'chromium', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npx --yes pnpm@10.30.3 --filter @eoq/api start', url: 'http://localhost:3001/cases', reuseExistingServer: false, timeout: 30000, env: { NODE_ENV: 'test', OPENAI_API_KEY: '', FRONTEND_URL: 'http://localhost:3000', PORT: '3001' } },
    { command: 'npx --yes pnpm@10.30.3 --filter @eoq/web start', url: 'http://localhost:3000', reuseExistingServer: false, timeout: 30000 },
  ],
});
