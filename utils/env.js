const dotenv = require('dotenv');

dotenv.config();

function readRequired(name) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`Environment variable ${name} is required.`);
  }

  return value.trim();
}

function readNumber(name, fallback) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const numericValue = Number(rawValue);

  if (Number.isNaN(numericValue) || numericValue <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number.`);
  }

  return numericValue;
}

const appConfig = {
  baseUrl: readRequired('BASE_URL'),
  username: readRequired('LOGIN_USERNAME'),
  password: readRequired('LOGIN_PASSWORD'),
  roomName: readRequired('ROOM_NAME'),
  messagePrefix: process.env.MESSAGE_PREFIX?.trim() || 'Playwright assignment',
  loginTimeoutMs: readNumber('LOGIN_TIMEOUT_MS', 30000),
  messageTimeoutMs: readNumber('MESSAGE_TIMEOUT_MS', 20000),
};

module.exports = {
  appConfig,
};
