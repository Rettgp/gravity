import { defineConfig, devices } from '@playwright/test';

const API_PORT = 8887;
const WEB_PORT = 5274;
const dbFile = '.gravity-local/e2e-' + Date.now() + '.json';

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:' + WEB_PORT, channel: 'chrome', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' }, testIgnore: /api\.spec/ },
  ],
  webServer: [
    {
      command: 'npx tsx scripts/local-server.ts',
      url: 'http://127.0.0.1:' + API_PORT + '/api/dev/users',
      env: { PORT: String(API_PORT), GRAVITY_LOCAL_DB: dbFile },
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -w apps/web',
      url: 'http://localhost:' + WEB_PORT,
      env: { WEB_PORT: String(WEB_PORT), GRAVITY_API: 'http://127.0.0.1:' + API_PORT },
      reuseExistingServer: false,
    },
  ],
});
