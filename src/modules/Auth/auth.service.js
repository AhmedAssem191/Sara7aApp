import { OAuth2Client } from 'google-auth-library';
import { disconnectUser } from '../../Utils/notifications.js';
import User, { safeUser } from '../../DB/models/user.model.js';
import Session from '../../DB/models/session.model.js';
import { compareHash, generateHash } from '../../Utils/security/hash.security.js';
import { encrypt } from '../../Utils/security/encryption.security.js';
import { generateOTP } from '../../Utils/generateOTP.js';
import { sendOtpEmail } from '../../Utils/events/email.events.js';
import { getNewLoginCredientails, issueTokens, hashToken } from '../../Utils/Token/token.js';
import { activeAccountFilter } from '../../middlewares/auth.meddleware.js';
import { BadRequestException, conflictException, unauthorizedException, errorResponse } from '../../Utils/response/error.response.js';
import { successResponse } from '../../Utils/response/success.response.js';
import { CLIENT_ID, REFRESH_EXPIRE, OTP_TTL_MS, OTP_COOLDOWN_MS, OTP_MAX_ATTEMPTS } from '../../../config/config.service.js';
const hash = plaintext => generateHash({ plaintext, algo: 'argon2' });
const compare = (plaintext, ciphertext) => compareHash({ plaintext, ciphertext, algo: ciphertext?.startsWith('$argon2') ? 'argon2' : 'bcrypt' });
const otpFields = purpose => [purpose + 'OTP', purpose + 'OTPExpiresAt', purpose + 'OTPAttempts', purpose + 'OTPSentAt'];
export const otpUnset = purpose => Object.fromEntries(otpFields(purpose).map(key => [key, 1]));

async function sendCode(req, user, purpose) {
  const [field, expires, attempts, sent] = otpFields(purpose);
  const otp = generateOTP();
  const digest = await hash(otp);
  const now = new Date();
  const updated = await User.findOneAndUpdate({
    _id: user._id,
    deletingAt: { $exists: false },
    ...(purpose === 'confirmEmail' ? { confirmEmail: { $exists: false } } : activeAccountFilter),
    $or: [{ [sent]: { $exists: false } }, { [sent]: { $lte: new Date(now - OTP_COOLDOWN_MS) } }],
  }, { $set: { [field]: digest, [expires]: new Date(+now + OTP_TTL_MS), [attempts]: 0, [sent]: now } }, { returnDocument: 'after' });
  // Same generic response for cooldown and unknown accounts prevents account enumeration.
  if (!updated) return;
  try {
    await (req.app.locals.sendOtpEmail || sendOtpEmail)({ to: user.email, firstName: user.firstName, otp, purpose });
  } catch {
    await User.updateOne({ _id: user._id, [field]: digest }, { $unset: otpUnset(purpose) });
    errorResponse({ status: 503, message: 'Email delivery failed; retry using resend' });
  }
}
async function claimCode(email, otp, purpose) {
  const [field, expires, attempts] = otpFields(purpose);
  const user = await User.findOneAndUpdate({
    email, provider: 0, deletingAt: { $exists: false },
    ...(purpose === 'confirmEmail' ? { confirmEmail: { $exists: false } } : activeAccountFilter),
    [field]: { $exists: true }, [expires]: { $gt: new Date() }, [attempts]: { $lt: OTP_MAX_ATTEMPTS },
  }, { $inc: { [attempts]: 1 } }, { returnDocument: 'after' }).select('+' + otpFields(purpose).join(' +'));
  if (!user || !await compare(otp, user[field])) BadRequestException('Invalid or expired code');
  return { user, filter: { _id: user._id, [field]: user[field], [expires]: { $gt: new Date() }, [attempts]: { $lte: OTP_MAX_ATTEMPTS }, deletingAt: { $exists: false } } };
}
export async function signup(req, res) {
  const { firstName, lastName, email, password, phone, age } = req.body;
  if (await User.exists({ email })) conflictException('Account already exists; sign in or resend confirmation');
  const user = await User.create({ firstName, lastName, email, age, phone: await encrypt(phone), password: await hash(password) });
  await sendCode(req, user, 'confirmEmail');
  return successResponse({ res, statusCode: 201, message: 'Account created; check your email', data: { user: safeUser(user) } });
}
export async function confirmEmail(req, res) {
  const { filter } = await claimCode(req.body.email, req.body.otp, 'confirmEmail');
  const result = await User.updateOne(filter, { $set: { confirmEmail: new Date() }, $unset: otpUnset('confirmEmail') });
  if (!result.modifiedCount) BadRequestException('Invalid or expired code');
  return successResponse({ res, message: 'Email confirmed' });
}
export async function resendConfirmation(req, res) {
  const user = await User.findOne({ email: req.body.email, provider: 0, confirmEmail: { $exists: false }, deletingAt: { $exists: false } });
  if (user) await sendCode(req, user, 'confirmEmail');
  return successResponse({ res, message: 'If eligible, a confirmation code has been sent' });
}
export async function login(req, res) {
  const user = await User.findOne({ email: req.body.email, provider: 0, ...activeAccountFilter }).select('+password +tokenVersion');
  if (!user || !await compare(req.body.password, user.password)) unauthorizedException('Invalid credentials or inactive account');
  const credentials = await getNewLoginCredientails(user, req);
  return successResponse({ res, data: { credentials, user: safeUser(user) } });
}
export async function refreshToken(req, res) {
  const credentials = issueTokens(req.user, req.decoded.sid);
  // Atomic rotation: a refresh token succeeds only once, even under concurrent requests.
  const session = await Session.findOneAndUpdate({
    _id: req.decoded.sid, userId: req.user._id, refreshHash: hashToken(req.token), expiresAt: { $gt: new Date() },
  }, { $set: { refreshHash: hashToken(credentials.refreshToken), expiresAt: new Date(Date.now() + REFRESH_EXPIRE * 1000) } });
  if (!session) unauthorizedException('Refresh token has already been used or revoked');
  return successResponse({ res, data: { credentials } });
}
export async function loginWithGoogle(req, res) {
  if (!CLIENT_ID && !req.app.locals.verifyGoogleToken) errorResponse({ status: 503, message: 'Google login is not configured' });
  let payload;
  try {
    payload = req.app.locals.verifyGoogleToken
      ? await req.app.locals.verifyGoogleToken(req.body.idToken)
      : (await new OAuth2Client(CLIENT_ID).verifyIdToken({ idToken: req.body.idToken, audience: CLIENT_ID })).getPayload();
  } catch { unauthorizedException('Invalid Google token'); }
  if (!payload?.email_verified || !payload.email || !payload.sub) unauthorizedException('A verified Google email is required');
  const email = payload.email.trim().toLowerCase();
  let user = await User.findOne({ email }).select('+tokenVersion +googleSub');
  if (user && (user.provider !== 1 || (user.googleSub && user.googleSub !== payload.sub))) conflictException('Sign in using your existing account method');
  if (user && (user.freezedAt || user.deletingAt)) unauthorizedException('Account is inactive');
  if (!user) user = await User.create({
    email, firstName: String(payload.given_name || payload.name || 'User').slice(0, 50),
    lastName: String(payload.family_name || '').slice(0, 50), provider: 1, googleSub: payload.sub,
    confirmEmail: new Date(), profilePicture: payload.picture?.startsWith('https://') ? payload.picture : undefined,
  });
  else if (!user.googleSub || !user.confirmEmail) {
    user = await User.findOneAndUpdate({ _id: user._id, freezedAt: { $exists: false }, deletingAt: { $exists: false } }, { $set: { googleSub: payload.sub, confirmEmail: user.confirmEmail || new Date() } }, { returnDocument: 'after' }).select('+tokenVersion');
    if (!user) unauthorizedException('Account is inactive');
  }
  return successResponse({ res, data: { credentials: await getNewLoginCredientails(user, req), user: safeUser(user) } });
}
export async function logout(req, res) {
  if (req.body.flag === 'logoutFromAll') {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 }, $set: { changeCredentialsTime: new Date() } });
    await Session.deleteMany({ userId: req.user._id });
  } else await Session.deleteOne({ _id: req.decoded.sid, userId: req.user._id });
  disconnectUser(req.user._id);
  return successResponse({ res, message: 'Logged out' });
}
export const logoutWithRedis = logout;
export async function forgetPassword(req, res) {
  const user = await User.findOne({ email: req.body.email, provider: 0, ...activeAccountFilter });
  if (user) await sendCode(req, user, 'forgetPassword');
  return successResponse({ res, message: 'If eligible, a reset code has been sent' });
}
export async function resetPassword(req, res) {
  const { user, filter } = await claimCode(req.body.email, req.body.otp, 'forgetPassword');
  const result = await User.updateOne({ ...filter, ...activeAccountFilter }, {
    $set: { password: await hash(req.body.password), changeCredentialsTime: new Date() },
    $inc: { tokenVersion: 1 }, $unset: otpUnset('forgetPassword'),
  });
  if (!result.modifiedCount) BadRequestException('Invalid or expired code');
  await Session.deleteMany({ userId: user._id });
  disconnectUser(user._id);
  return successResponse({ res, message: 'Password reset; sign in again' });
}
export async function listSessions(req, res) {
  const sessions = await Session.find({ userId: req.user._id, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean();
  return successResponse({ res, data: { sessions: sessions.map(s => ({ id: s._id, userAgent: s.userAgent, createdAt: s.createdAt, expiresAt: s.expiresAt, current: s._id === req.decoded.sid })) } });
}
export async function revokeSession(req, res) {
  const result = await Session.deleteOne({ _id: req.params.sessionId, userId: req.user._id });
  if (!result.deletedCount) return res.status(404).json({ message: 'Session not found' });
  disconnectUser(req.user._id);
  return successResponse({ res, message: 'Session revoked' });
}
