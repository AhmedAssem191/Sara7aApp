import jwt from 'jsonwebtoken';
import { randomUUID, createHash } from 'node:crypto';
import { ACCESS_EXPIRE, REFRESH_EXPIRE, TOKEN_ADMIN_ACCESS_KEY, TOKEN_ADMIN_REFRESH_KEY, TOKEN_USER_ACCESS_KEY, TOKEN_USER_REFRESH_KEY } from '../../../config/config.service.js';
import Session from '../../DB/models/session.model.js';
export const getSignature = ({ signatureLevel = 1 }) => ({
  accessSignature: signatureLevel === 0 ? TOKEN_ADMIN_ACCESS_KEY : TOKEN_USER_ACCESS_KEY,
  refreshSignature: signatureLevel === 0 ? TOKEN_ADMIN_REFRESH_KEY : TOKEN_USER_REFRESH_KEY,
});
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const generateToken = ({ payload, secertKey = TOKEN_USER_ACCESS_KEY, option = { expiresIn: ACCESS_EXPIRE } }) =>
  jwt.sign(payload, secertKey, { algorithm: 'HS256', issuer: 'sara7a', audience: 'sara7a-api', ...option });
export const verifyToken = ({ token, secertKey = TOKEN_USER_ACCESS_KEY }) =>
  jwt.verify(token, secertKey, { algorithms: ['HS256'], issuer: 'sara7a', audience: 'sara7a-api' });
export function issueTokens(user, sid) {
  const keys = getSignature({ signatureLevel: user.role });
  const payload = { id: String(user._id), role: user.role, sid, version: user.tokenVersion || 0 };
  return {
    accessToken: generateToken({ payload: { ...payload, type: 'access' }, secertKey: keys.accessSignature, option: { expiresIn: ACCESS_EXPIRE, jwtid: randomUUID() } }),
    refreshToken: generateToken({ payload: { ...payload, type: 'refresh' }, secertKey: keys.refreshSignature, option: { expiresIn: REFRESH_EXPIRE, jwtid: randomUUID() } }),
  };
}
export async function getNewLoginCredientails(user, req = {}) {
  const sid = randomUUID();
  const credentials = issueTokens(user, sid);
  await Session.create({ _id: sid, userId: user._id, refreshHash: hashToken(credentials.refreshToken), expiresAt: new Date(Date.now() + REFRESH_EXPIRE * 1000), userAgent: String(req.headers?.['user-agent'] || '').slice(0, 300) });
  return credentials;
}
