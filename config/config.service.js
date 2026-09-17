import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
export const NODE_ENV = process.env.NODE_ENV || 'development';
if (NODE_ENV !== 'test') dotenv.config({ path: fileURLToPath(new URL(`./.env.${NODE_ENV === 'production' ? 'prod' : 'dev'}`, import.meta.url)), override: false, quiet: true });
export const PORT = Number(process.env.PORT || 3000);
export const DB_URI = process.env.DB_URI;
export const SALT = Number(process.env.SALT || 12);
export const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;
export const TOKEN_USER_ACCESS_KEY = process.env.TOKEN_USER_ACCESS_KEY;
export const TOKEN_USER_REFRESH_KEY = process.env.TOKEN_USER_REFRESH_KEY;
export const TOKEN_ADMIN_ACCESS_KEY = process.env.TOKEN_ADMIN_ACCESS_KEY;
export const TOKEN_ADMIN_REFRESH_KEY = process.env.TOKEN_ADMIN_REFRESH_KEY;
export const TOKEN_ACCESS_KEY = TOKEN_USER_ACCESS_KEY;
export const TOKEN_REFRESH_ACCESS_KEY = TOKEN_USER_REFRESH_KEY;
export const ACCESS_EXPIRE = Number(process.env.ACCESS_EXPIRE || 900);
export const REFRESH_EXPIRE = Number(process.env.REFRESH_EXPIRE || 604800);
export const CLIENT_ID = process.env.CLIENT_ID;
export const REDIS_URI = process.env.REDIS_URI;
export const USER_EMAIL = process.env.USER_EMAIL;
export const USER_PASSWORD = process.env.USER_PASSWORD;
export const WHITE_LIST = process.env.WHITE_LIST || '';
export const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
export const TRUST_PROXY = process.env.TRUST_PROXY || '';
export const ABUSE_HASH_SECRET = process.env.ABUSE_HASH_SECRET || ENCRYPTION_SECRET;
export const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || '';
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export function validateConfig() {
  const errors = [];
  if (!DB_URI?.startsWith('mongodb')) errors.push('DB_URI must be a MongoDB URI');
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) errors.push('PORT must be 1–65535');
  if (Buffer.byteLength(ENCRYPTION_SECRET || '') !== 32) errors.push('ENCRYPTION_SECRET must be exactly 32 UTF-8 bytes');
  const keys = { TOKEN_USER_ACCESS_KEY, TOKEN_USER_REFRESH_KEY, TOKEN_ADMIN_ACCESS_KEY, TOKEN_ADMIN_REFRESH_KEY };
  for (const [name, key] of Object.entries(keys)) if (!key || (NODE_ENV === 'production' && key.length < 32)) errors.push(`${name} is missing or too short for production`);
  if (new Set(Object.values(keys)).size !== 4) errors.push('Use distinct token signing keys');
  if (!Number.isInteger(ACCESS_EXPIRE) || ACCESS_EXPIRE < 60 || ACCESS_EXPIRE > 86400) errors.push('ACCESS_EXPIRE must be 60–86400 seconds');
  if (!Number.isInteger(REFRESH_EXPIRE) || REFRESH_EXPIRE <= ACCESS_EXPIRE || REFRESH_EXPIRE > 2592000) errors.push('REFRESH_EXPIRE must exceed ACCESS_EXPIRE and be at most 30 days');
  if (!USER_EMAIL || !USER_PASSWORD) errors.push('USER_EMAIL and USER_PASSWORD are required for email delivery');
  if (!ABUSE_HASH_SECRET || ABUSE_HASH_SECRET.length < 32) errors.push('ABUSE_HASH_SECRET must contain at least 32 characters');
  try { const url = new URL(PUBLIC_URL); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); } catch { errors.push('PUBLIC_URL must be an HTTP(S) URL'); }
  if (errors.length) throw new Error(`Invalid configuration: ${errors.join('; ')}`);
}
