const { defineConfig } = require('@playwright/test');
const dotenv = require('dotenv');

dotenv.config();
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: chromiumExecutablePath
      ? {
          executablePath: chromiumExecutablePath,
        }
      : undefined,
  },
});
