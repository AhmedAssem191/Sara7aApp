import crypto from 'node:crypto';
import { ENCRYPTION_SECRET } from '../../../config/config.service.js';
export const encrypt = async (text) => {
  if (text == null) return undefined;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_SECRET), iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return ['v2', iv.toString('hex'), cipher.getAuthTag().toString('hex'), data.toString('hex')].join(':');
};
export const decrypt = async (value) => {
  if (!value) return undefined;
  const parts = value.split(':');
  let decipher, data;
  if (parts[0] === 'v2') {
    decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_SECRET), Buffer.from(parts[1], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[2], 'hex')); data = parts[3];
  } else {
    // Read existing records; new writes use authenticated encryption.
    decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_SECRET), Buffer.from(parts[0], 'hex')); data = parts[1];
  }
  const result = decipher.update(data, 'hex', 'utf8') + decipher.final('utf8');
  return result === 'undefined' ? undefined : result;
};
