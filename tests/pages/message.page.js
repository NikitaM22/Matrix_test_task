const { expect } = require('@playwright/test');
const { appConfig } = require('../../utils/env');

const REGEX_SESSION_RESTORE_ERROR = /восстановление сеанса не удалось|session restore failed|could not restore previous session/i;
const REGEX_ROOM_SEARCH = /search|room|chat|поиск|комнат/i;
const REGEX_MESSAGE_COMPOSER = /message|send a message|composer|сообщение|написать/i;
const REGEX_SEND_BUTTON = /send|отправить/i;
const REGEX_SEND_SUCCESS_TOAST = /your message was sent|ваше сообщение было отправлено|сообщение отправлено/i;
const REGEX_DIALOG_LATER = /позже|later/i;
const REGEX_DIALOG_OK = /^ok$/i;
const REGEX_DIALOG_CLOSE = /close dialog|закрыть/i;
const REGEX_DIALOG_SKIP = /skip|пропустить/i;
const REGEX_ROOMS_FILTER = /^rooms$|^комнаты$/i;
const SEND_RESPONSE_REGEX = /\/_matrix\/client\/(?:v3|r0)\/rooms\/.+\/send\/m\.room\.message\//;
const POST_SEND_ASSERT_TIMEOUT_MS = Math.min(appConfig.messageTimeoutMs, 10_000);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class MessagePage {
  constructor(page) {
    this.page = page;
  }

  async openAuthenticatedApp() {
    await this.gotoWithRetry(appConfig.baseUrl, { waitUntil: 'domcontentloaded' });

    const sessionRestoreError = this.page.getByText(REGEX_SESSION_RESTORE_ERROR);
    if (await sessionRestoreError.first().isVisible().catch(() => false)) {
      throw new Error('Session restore failed. Re-create persistent profile with: npm run auth:setup');
    }

    await this.dismissBlockingDialogs();
    await this.expectAuthenticatedShell();
  }

  async openRoom(roomName) {
    const { roomNamePattern, candidates } = this.buildRoomCandidates(roomName);
    const expectRoomOpened = async () => {
      await expect(this.page.getByRole('heading', { name: roomNamePattern }).first()).toBeVisible({
        timeout: appConfig.messageTimeoutMs,
      });
    };

    try {
      const room = await this.waitForVisible(candidates, 'room list item', 4000);
      await room.click();
      await expectRoomOpened();
      return;
    } catch {
      // Room is not immediately visible, continue with fallback.
    }

    await this.tryClickVisible(
      [
        this.page.getByRole('option', { name: REGEX_ROOMS_FILTER }),
        this.page.getByRole('button', { name: REGEX_ROOMS_FILTER }),
        this.page.getByText(REGEX_ROOMS_FILTER),
      ],
      2500
    );

    try {
      const room = await this.waitForVisible(candidates, 'room list item in rooms tab', 4000);
      await room.click();
      await expectRoomOpened();
      return;
    } catch {
      // Fall through to explicit search.
    }

    const roomSearch = await this.waitForVisible(
      [
        this.page.getByRole('searchbox', { name: REGEX_ROOM_SEARCH }),
        this.page.getByRole('textbox', { name: REGEX_ROOM_SEARCH }),
        this.page.getByPlaceholder(/search|room|chat|поиск/i),
      ],
      'room search',
      appConfig.messageTimeoutMs
    );

    await roomSearch.fill(roomName);
    const room = await this.waitForVisible(candidates, 'searched room list item', appConfig.messageTimeoutMs);
    await room.click();
    await expectRoomOpened();
  }

  async sendMessageAndVerify(text) {
    await this.dismissBlockingDialogs();

    const composer = await this.waitForVisible(
      [
        this.page.getByRole('textbox', { name: REGEX_MESSAGE_COMPOSER }),
        this.page.getByPlaceholder(REGEX_MESSAGE_COMPOSER),
        this.page.locator('[contenteditable="true"][role="textbox"]'),
        this.page.locator('textarea, input[aria-label*="message" i]'),
      ],
      'message composer',
      appConfig.messageTimeoutMs
    );

    const sendResponsePromise = this.page
      .waitForResponse(
        (response) => response.request().method() === 'PUT' && SEND_RESPONSE_REGEX.test(response.url()),
        { timeout: Math.min(appConfig.messageTimeoutMs, 8000) }
      )
      .catch(() => null);

    await this.fillComposer(composer, text);
    const clickedSendButton = await this.tryClickVisible(
      [
        this.page.getByRole('button', { name: REGEX_SEND_BUTTON }),
        this.page.locator('[aria-label*="send" i], [data-testid="send-button"]'),
      ],
      2000
    );

    if (!clickedSendButton) {
      await composer.press('Enter');
    }

    const sendResponse = await sendResponsePromise;
    if (sendResponse) {
      expect(sendResponse.ok()).toBeTruthy();
      const responseBody = await sendResponse.json().catch(() => ({}));
      expect(responseBody.event_id || responseBody.eventId).toBeTruthy();
    }

    const timeline = await this.waitForVisible(
      [
        this.page.locator('[data-testid="timeline"]'),
        this.page.locator('[aria-label*="timeline" i], [aria-label*="message list" i]'),
        this.page.getByRole('main'),
      ],
      'message timeline',
      POST_SEND_ASSERT_TIMEOUT_MS
    );

    await expect(timeline.getByText(text, { exact: true })).toBeVisible({
      timeout: POST_SEND_ASSERT_TIMEOUT_MS,
    });

    if (!sendResponse) {
      await expect(this.page.getByText(REGEX_SEND_SUCCESS_TOAST).first()).toBeVisible({
        timeout: POST_SEND_ASSERT_TIMEOUT_MS,
      });
    }
  }

  async gotoWithRetry(url, options = {}) {
    const maxAttempts = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.page.goto(url, options);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          await this.page.waitForTimeout(1500 * attempt);
        }
      }
    }

    throw new Error(`Could not open ${url} after ${maxAttempts} attempts: ${lastError?.message || 'unknown error'}`);
  }

  async dismissBlockingDialogs() {
    await this.tryClickVisible(
      [
        this.page.getByRole('button', { name: REGEX_DIALOG_LATER }),
        this.page.getByRole('button', { name: REGEX_DIALOG_OK }),
        this.page.getByRole('button', { name: REGEX_DIALOG_CLOSE }),
        this.page.getByRole('button', { name: REGEX_DIALOG_SKIP }),
      ],
      2500
    );
  }

  async expectAuthenticatedShell() {
    const shell = await this.waitForVisible(
      [
        this.page.getByRole('navigation', { name: /room list|список комнат/i }),
        this.page.getByRole('listbox', { name: /room list|список комнат/i }),
        this.page.getByRole('button', { name: /search|поиск/i }),
      ],
      'post-login application shell',
      appConfig.loginTimeoutMs
    );

    await expect(shell).toBeVisible({ timeout: appConfig.loginTimeoutMs });
  }

  buildRoomCandidates(roomName) {
    const escapedRoomName = escapeRegExp(roomName);
    const roomNamePattern = new RegExp(escapedRoomName, 'i');

    return {
      roomNamePattern,
      candidates: [
        this.page.getByRole('option', {
          name: new RegExp(`open room\\s+${escapedRoomName}|${escapedRoomName}`, 'i'),
        }),
        this.page.getByRole('treeitem', { name: roomNamePattern }),
        this.page.getByRole('link', { name: roomNamePattern }),
        this.page.getByRole('button', { name: roomNamePattern }),
        this.page.getByText(roomNamePattern),
      ],
    };
  }

  async waitForVisible(candidates, description, timeoutMs) {
    const perLocatorTimeout = Math.max(1500, Math.floor(timeoutMs / candidates.length));

    for (const candidate of candidates) {
      const locator = candidate.first();
      try {
        await locator.waitFor({ state: 'visible', timeout: perLocatorTimeout });
        return locator;
      } catch {
        // Continue searching through candidates.
      }
    }

    throw new Error(`Could not find visible element for: ${description}`);
  }

  async tryClickVisible(candidates, timeoutMs) {
    for (const candidate of candidates) {
      const locator = candidate.first();
      try {
        await locator.waitFor({ state: 'visible', timeout: timeoutMs });
        await locator.click();
        return true;
      } catch {
        // Try next candidate.
      }
    }

    return false;
  }

  async fillComposer(composer, text) {
    await composer.click();
    try {
      await composer.fill(text);
      return;
    } catch {
      // Some Matrix clients use contenteditable instead of textarea.
    }

    await composer.press('Meta+A').catch(() => {});
    await composer.press('Control+A').catch(() => {});
    await composer.press('Backspace').catch(() => {});
    await composer.pressSequentially(text);
  }
}

module.exports = {
  MessagePage,
};
