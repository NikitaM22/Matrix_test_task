const fs = require('fs');
const readline = require('readline');
const dotenv = require('dotenv');
const { chromium } = require('playwright');
const { appConfig } = require('../utils/env');

dotenv.config();

const userDataDir = process.env.PLAYWRIGHT_USER_DATA_DIR?.trim() || 'playwright/.user-data';
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();

function waitForEnter() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('\nComplete login in the opened browser, then press Enter here to save session.\n', () => {
      rl.close();
      resolve();
    });
  });
}

async function waitForAuthenticatedShell(page) {
  const candidates = [
    page.getByRole('searchbox', { name: /search|room|chat|поиск|комнат/i }),
    page.getByRole('textbox', { name: /search|room|chat|поиск|комнат/i }),
    page.locator('[aria-label*="room" i], [aria-label*="chat" i], [data-testid="room-list"]'),
    page.getByRole('main'),
  ];

  const timeoutMs = 90_000;
  const perLocatorTimeout = Math.max(2000, Math.floor(timeoutMs / candidates.length));

  for (const candidate of candidates) {
    try {
      await candidate.first().waitFor({ state: 'visible', timeout: perLocatorTimeout });
      return;
    } catch {
      // Try next indicator.
    }
  }

  throw new Error('Authenticated shell was not detected after manual login.');
}

async function assertNoSessionRestoreError(page) {
  const restoreErrorIndicator = page.getByText(
    /восстановление сеанса не удалось|session restore failed|could not restore previous session/i
  );

  const hasRestoreError = await restoreErrorIndicator.first().isVisible().catch(() => false);

  if (hasRestoreError) {
    throw new Error(
      'Element reported session restore failure. Remove persistent profile directory and run auth:setup again.'
    );
  }
}

async function main() {
  fs.mkdirSync(userDataDir, { recursive: true });
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: chromiumExecutablePath || undefined,
  });
  const page = context.pages()[0] || (await context.newPage());

  try {
    await page.goto(appConfig.baseUrl, { waitUntil: 'domcontentloaded' });
    await waitForEnter();
    await assertNoSessionRestoreError(page);
    await waitForAuthenticatedShell(page);
    console.log(`\nPersistent browser profile is ready: ${userDataDir}`);
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
