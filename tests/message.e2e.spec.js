const fs = require('fs');
const { test, chromium } = require('@playwright/test');
const { appConfig } = require('../utils/env');
const { MessagePage } = require('./pages/message.page');
const userDataDir = process.env.PLAYWRIGHT_USER_DATA_DIR?.trim() || 'playwright/.user-data';
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();

test('user can send a text message and see it in the timeline', async () => {
test.setTimeout(90_000);
  const uniqueMessage = `${appConfig.messagePrefix} ${new Date().toISOString()}`;
  fs.mkdirSync(userDataDir, { recursive: true });
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: chromiumExecutablePath || undefined,
  });
  const page = context.pages()[0] || (await context.newPage());
  const messagePage = new MessagePage(page);

  try {
    await messagePage.openAuthenticatedApp();
    await messagePage.openRoom(appConfig.roomName);
    await messagePage.sendMessageAndVerify(uniqueMessage);
  } finally {
    await context.close();
  }
});
