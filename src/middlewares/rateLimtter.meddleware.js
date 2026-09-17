import { rateLimit } from 'express-rate-limit';
import { NODE_ENV } from '../../config/config.service.js';
import { MongoRateLimitStore } from '../Utils/rate-limit.store.js';
const limiter = (name, limit, windowMs) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false,
  // Test HTTP suites use independent in-memory windows; the Mongo store has dedicated integration tests.
  ...(NODE_ENV !== 'test' ? { store: new MongoRateLimitStore(name) } : {}),
  message: { message: 'Too many requests; try again later', status: 429 },
});
export const customRateLimiter = limiter('global', 300, 60 * 1000);
export const authLimiter = limiter('auth', 30, 15 * 60 * 1000);
export const emailLimiter = limiter('email', 10, 15 * 60 * 1000);
export const messageLimiter = limiter('message', 20, 60 * 1000);
export const uploadLimiter = limiter('upload', 20, 15 * 60 * 1000);
