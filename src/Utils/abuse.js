import { createHmac } from 'node:crypto';
import { ABUSE_HASH_SECRET } from '../../config/config.service.js';
export const fingerprint = value => createHmac('sha256', ABUSE_HASH_SECRET).update(value).digest('hex');
export function senderKeys(req, receiverId) {
  const prefix = String(receiverId) + ':';
  return [fingerprint(prefix + 'ip:' + req.ip), ...(req.user ? [fingerprint(prefix + 'user:' + req.user._id)] : [])];
}
