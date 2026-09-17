import QRCode from 'qrcode';
import { OAuth2Client } from 'google-auth-library';
import { randomBytes } from 'node:crypto';
import User, { safeUser } from '../../DB/models/user.model.js';
import Session from '../../DB/models/session.model.js';
import Message from '../../DB/models/message.model.js';
import Report from '../../DB/models/report.model.js';
import Block from '../../DB/models/block.model.js';
import Token from '../../DB/models/token.model.js';
import Audit from '../../DB/models/audit.model.js';
import { decrypt } from '../../Utils/security/encryption.security.js';
import { compareHash, generateHash } from '../../Utils/security/hash.security.js';
import { successResponse } from '../../Utils/response/success.response.js';
import { BadRequestException, ForbiddenException, NotFoundException, unauthorizedException } from '../../Utils/response/error.response.js';
import { activeAccountFilter } from '../../middlewares/auth.meddleware.js';
import { removeUpload, removeUserUploads } from '../../Utils/multer/cleanup.js';
import { disconnectUser } from '../../Utils/notifications.js';
import { CLIENT_ID, PUBLIC_URL } from '../../../config/config.service.js';

const ok = (res, data = {}, message = 'Done') => successResponse({ res, data, message });
const publicFields = 'firstName lastName handle bio theme profilePicture coverImages acceptMessages allowAnonymous';
const pageQuery = req => req.validated.query;
async function ensureHandle(user) {
  if (!user) NotFoundException();
  if (user.handle && !user.$isDefault('handle')) return user;
  const updated = await User.findOneAndUpdate({ _id: user._id, handle: { $exists: false }, ...activeAccountFilter }, { $set: { handle: 'user-' + randomBytes(10).toString('hex') } }, { returnDocument: 'after' }).select('+phone');
  return updated || User.findById(user._id).select('+phone');
}
export async function getprofile(req, res) {
  const user = await ensureHandle(await User.findById(req.user._id).select('+phone'));
  const phone = user.phone ? await decrypt(user.phone) : undefined;
  return ok(res, { user: { ...safeUser(user), ...(phone ? { phone } : {}) }, profileUrl: PUBLIC_URL.replace(/\/$/, '') + '/u/' + user.handle });
}
export async function updateProfile(req, res) {
  const user = await User.findOneAndUpdate({ _id: req.user._id, ...activeAccountFilter }, { $set: req.body }, { returnDocument: 'after', runValidators: true });
  if (!user) NotFoundException();
  if (req.body.notificationsEnabled === false) disconnectUser(req.user._id);
  return ok(res, { user: safeUser(user) });
}
export async function publicProfile(req, res) {
  const handle = req.validated.params.handle;
  const user = await User.findOneAndUpdate({ handle, ...activeAccountFilter }, { $inc: { profileViews: 1 } }, { returnDocument: 'after' }).select(publicFields);
  if (!user) NotFoundException('Profile not found');
  // Only explicit public fields; never expose email, age, phone, roles or moderation data.
  return ok(res, { user });
}
export async function profileQR(req, res) {
  const user = await User.findOne({ handle: req.validated.params.handle, ...activeAccountFilter }).select('handle');
  if (!user) NotFoundException('Profile not found');
  const svg = await QRCode.toString(PUBLIC_URL.replace(/\/$/, '') + '/u/' + user.handle, { type: 'svg', margin: 2 });
  res.type('image/svg+xml').send(svg);
}
async function replaceImages(req, res, field, value) {
  const old = await User.findOneAndUpdate({ _id: req.user._id, ...activeAccountFilter }, { $set: { [field]: value } }, { returnDocument: 'before', runValidators: true });
  if (!old) NotFoundException();
  req.uploadsCommitted = true;
  const paths = Array.isArray(old[field]) ? old[field] : [old[field]];
  await Promise.all(paths.map(removeUpload));
  return ok(res, { [field]: value });
}
export const updateProfilePic = (req, res) => replaceImages(req, res, 'profilePicture', req.file.finalPath);
export const updateCoverPic = (req, res) => replaceImages(req, res, 'coverImages', req.files.map(file => file.finalPath));
export async function updatePassword(req, res) {
  const user = await User.findById(req.user._id).select('+password');
  if (user.provider !== 0) BadRequestException('Use your Google account to manage its password');
  if (!await compareHash({ plaintext: req.body.oldPassword, ciphertext: user.password, algo: user.password?.startsWith('$argon2') ? 'argon2' : 'bcrypt' })) BadRequestException('Invalid password');
  const password = await generateHash({ plaintext: req.body.newPassword, algo: 'argon2' });
  const result = await User.updateOne({ _id: user._id, password: user.password, ...activeAccountFilter }, { $set: { password, changeCredentialsTime: new Date() }, $inc: { tokenVersion: 1 } });
  if (!result.modifiedCount) BadRequestException('Account changed; sign in again');
  await Session.deleteMany({ userId: user._id });
  disconnectUser(user._id);
  return ok(res, {}, 'Password updated; sign in again');
}
export async function freezeAccount(req, res) {
  const id = req.params.userId || req.user._id;
  if (String(id) !== String(req.user._id) && req.user.role !== 0) ForbiddenException();
  const user = await User.findOneAndUpdate({ _id: id, freezedAt: { $exists: false }, deletingAt: { $exists: false } }, {
    $set: { freezedAt: new Date(), freezedBy: req.user._id }, $inc: { tokenVersion: 1 }, $unset: { restoredAt: 1, restoredBy: 1 },
  }, { returnDocument: 'after' });
  if (!user) NotFoundException('Active account not found');
  await Session.deleteMany({ userId: id });
  disconnectUser(id);
  await Audit.create({ actorId: req.user._id, action: 'freeze-account', targetId: id });
  return ok(res, {}, 'Account frozen');
}
export async function restoreAccount(req, res) {
  const user = await User.findOneAndUpdate({ _id: req.params.userId, freezedAt: { $exists: true }, deletingAt: { $exists: false } }, {
    $set: { restoredAt: new Date(), restoredBy: req.user._id }, $unset: { freezedAt: 1, freezedBy: 1 },
  }, { returnDocument: 'after' });
  if (!user) NotFoundException('Frozen account not found');
  await Audit.create({ actorId: req.user._id, action: 'restore-account', targetId: user._id });
  return ok(res, {}, 'Account restored; sign in again');
}
// Tombstone first so partial cleanup can be retried by an admin without reactivating access.
export async function deleteAccount(id) {
  const user = await User.findByIdAndUpdate(id, { $set: { deletingAt: new Date() }, $inc: { tokenVersion: 1 } }, { returnDocument: 'after' });
  if (!user) NotFoundException('User not found');
  disconnectUser(id);
  await Session.deleteMany({ userId: id });
  await Token.deleteMany({ userId: id });
  await Report.deleteMany({ reporterId: id });
  await Block.deleteMany({ receiverId: id });
  await Message.deleteMany({ receiverId: id });
  await Promise.all([user.profilePicture, ...user.coverImages].map(removeUpload));
  await removeUserUploads(id);
  await User.deleteOne({ _id: id, deletingAt: { $exists: true } });
}
export async function hardDeleteAccount(req, res) {
  await deleteAccount(req.params.userId);
  await Audit.create({ actorId: req.user._id, action: 'delete-account', targetId: req.params.userId });
  return ok(res, {}, 'Account deleted');
}
export async function deleteSelf(req, res) {
  const user = await User.findById(req.user._id).select('+password +googleSub');
  if (user.provider === 0) {
    if (!req.body.password || !await compareHash({ plaintext: req.body.password, ciphertext: user.password, algo: user.password?.startsWith('$argon2') ? 'argon2' : 'bcrypt' })) unauthorizedException('Verify your password');
  } else {
    let payload;
    try {
      payload = req.app.locals.verifyGoogleToken ? await req.app.locals.verifyGoogleToken(req.body.idToken)
        : (await new OAuth2Client(CLIENT_ID).verifyIdToken({ idToken: req.body.idToken, audience: CLIENT_ID })).getPayload();
    } catch { unauthorizedException('Verify your Google account'); }
    if (!payload?.email_verified || payload.sub !== user.googleSub) unauthorizedException('Verify your Google account');
  }
  await deleteAccount(user._id);
  return ok(res, {}, 'Account deleted');
}
export async function exportData(req, res) {
  const user = await User.findById(req.user._id).select('+phone');
  res.set({ 'Content-Disposition': 'attachment; filename="sara7a-data.ndjson"', 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' });
  const write = async value => {
    if (!res.write(JSON.stringify(value) + '\n')) await new Promise(resolve => {
      const done = () => { res.off('drain', done); res.off('close', done); resolve(); };
      res.once('drain', done); res.once('close', done);
    });
  };
  await write({ type: 'profile', data: { ...safeUser(user), phone: await decrypt(user.phone) } });
  const cursor = Message.find({ receiverId: user._id }).select('-__v').lean().cursor();
  try { for await (const message of cursor) { if (res.destroyed) break; await write({ type: 'message', data: message }); } }
  finally { await cursor.close(); }
  res.end();
}
export async function statistics(req, res) {
  const filter = { receiverId: req.user._id };
  const [total, unread, favorites, published, user] = await Promise.all([
    Message.countDocuments(filter), Message.countDocuments({ ...filter, readAt: { $exists: false } }),
    Message.countDocuments({ ...filter, favorite: true }), Message.countDocuments({ ...filter, published: true }),
    User.findById(req.user._id).select('profileViews'),
  ]);
  return ok(res, { total, unread, favorites, published, profileViews: user.profileViews || 0 });
}
export async function listBlocks(req, res) {
  const { page, limit } = pageQuery(req);
  const filter = { receiverId: req.user._id };
  const [blocks, total] = await Promise.all([Block.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit), Block.countDocuments(filter)]);
  return ok(res, { blocks, total, page, limit });
}
export async function unblock(req, res) {
  const result = await Block.deleteOne({ _id: req.params.blockId, receiverId: req.user._id });
  if (!result.deletedCount) NotFoundException();
  return ok(res, {}, 'Sender unblocked');
}
