import jwt from 'jsonwebtoken';
import User from '../DB/models/user.model.js';
import Session from '../DB/models/session.model.js';
import { getSignature, verifyToken } from '../Utils/Token/token.js';
import { unauthorizedException, ForbiddenException } from '../Utils/response/error.response.js';
export const activeAccountFilter = { confirmEmail: { $exists: true, $ne: null }, freezedAt: { $exists: false }, deletingAt: { $exists: false } };
export async function decodedToken({ authorization, tokenType = 0 }) {
  if (typeof authorization !== 'string') unauthorizedException();
  const match = /^(Bearer|Admin|User) ([^\s]+)$/i.exec(authorization);
  if (!match) unauthorizedException('Use Authorization: Bearer <token>');
  // The untrusted role selects a key only. Signature, token type, role and session are then verified.
  const hint = jwt.decode(match[2]);
  if (!hint || ![0, 1].includes(hint.role)) unauthorizedException('Invalid token');
  const keys = getSignature({ signatureLevel: hint.role });
  const decoded = verifyToken({ token: match[2], secertKey: tokenType === 1 ? keys.refreshSignature : keys.accessSignature });
  if (decoded.type !== (tokenType === 1 ? 'refresh' : 'access') || !decoded.sid || !decoded.jti || !/^[a-f0-9]{24}$/i.test(decoded.id || '')) unauthorizedException('Invalid token');
  const user = await User.findOne({ _id: decoded.id, ...activeAccountFilter }).select('+tokenVersion');
  if (!user || user.role !== decoded.role || (user.tokenVersion || 0) !== decoded.version) unauthorizedException('Session is no longer valid');
  const session = await Session.findOne({ _id: decoded.sid, userId: user._id, expiresAt: { $gt: new Date() } });
  if (!session) unauthorizedException('Session is no longer valid');
  return { user, decoded, session, token: match[2] };
}
export const authentication = ({ tokenType = 0, optional = false } = {}) => async (req, res, next) => {
  if (optional && !req.headers.authorization) return next();
  Object.assign(req, await decodedToken({ authorization: req.headers.authorization, tokenType }));
  next();
};
export const authorization = ({ accessRole = [] }) => (req, res, next) => {
  if (!req.user || !accessRole.includes(req.user.role)) ForbiddenException();
  next();
};
