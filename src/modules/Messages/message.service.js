import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import User from '../../DB/models/user.model.js';
import Message from '../../DB/models/message.model.js';
import Block from '../../DB/models/block.model.js';
import Report from '../../DB/models/report.model.js';
import Audit from '../../DB/models/audit.model.js';
import Abuse from '../../DB/models/abuse.model.js';
import { activeAccountFilter } from '../../middlewares/auth.meddleware.js';
import { NotFoundException, ForbiddenException, errorResponse, BadRequestException } from '../../Utils/response/error.response.js';
import { successResponse } from '../../Utils/response/success.response.js';
import { senderKeys, fingerprint } from '../../Utils/abuse.js';
import { notifyUser } from '../../Utils/notifications.js';
import { verifyCaptcha } from '../../Utils/captcha.js';
import { PUBLIC_URL } from '../../../config/config.service.js';
const ok = (res, data = {}, statusCode = 200) => successResponse({ res, data, statusCode });
const escapedRegex = text => text.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
const escapeXml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const messageDTO = m => ({ _id: m._id, content: m.content, receiverId: m.receiverId, createdAt: m.createdAt, readAt: m.readAt, favorite: m.favorite, published: m.published, ...(m.shareId && m.published ? { shareUrl: PUBLIC_URL.replace(/\/$/, '') + '/api/message/shared/' + m.shareId } : {}) });

export async function sendMessage(req, res) {
  const user = await User.findOne({ _id: req.params.receiverId, ...activeAccountFilter });
  if (!user) NotFoundException('Receiver not found');
  if (!user.acceptMessages || (!user.allowAnonymous && !req.user)) ForbiddenException('This account is not accepting this type of message');
  const keys = senderKeys(req, user._id);
  if (await Block.exists({ receiverId: user._id, senderKey: { $in: keys } })) ForbiddenException('Cannot send to this account');
  await verifyCaptcha(req);
  // Atomic duplicate suppression is shared across processes; TTL eventually removes reservations.
  const reservation = fingerprint(keys[0] + ':' + req.body.content);
  await Abuse.deleteOne({ _id: reservation, expiresAt: { $lte: new Date() } });
  try { await Abuse.create({ _id: reservation, expiresAt: new Date(Date.now() + 60000) }); }
  catch (error) { if (error.code === 11000) errorResponse({ status: 429, message: 'Please wait before repeating this message' }); throw error; }
  let message;
  try { message = await Message.create({ content: req.body.content, receiverId: user._id, senderKey: keys.at(-1), senderKeys: keys }); }
  catch (error) { await Abuse.deleteOne({ _id: reservation }); throw error; }
  if (!await User.exists({ _id: user._id, ...activeAccountFilter, acceptMessages: true, ...(!req.user ? { allowAnonymous: true } : {}) })) {
    await Message.deleteOne({ _id: message._id });
    ForbiddenException('This account is not accepting messages');
  }
  if (user.notificationsEnabled) await notifyUser(user._id, { id: message._id, createdAt: message.createdAt });
  // Never return internal abuse identifiers, even to the sender.
  return ok(res, { message: { _id: message._id, content: message.content, createdAt: message.createdAt } }, 201);
}
export async function getMessage(req, res) {
  const { page, limit, sort, read, favorite, search } = req.validated.query;
  const receiverId = req.user.role === 0 && req.params.receiverId ? req.params.receiverId : req.user._id;
  const filter = { receiverId };
  if (read !== undefined) filter.readAt = { $exists: read };
  if (favorite !== undefined) filter.favorite = favorite;
  if (search) filter.content = { $regex: escapedRegex(search), $options: 'i' };
  const [messages, total] = await Promise.all([
    Message.find(filter).select('+shareId').sort({ createdAt: sort === 'oldest' ? 1 : -1, _id: sort === 'oldest' ? 1 : -1 }).skip((page - 1) * limit).limit(limit),
    Message.countDocuments(filter),
  ]);
  if (String(receiverId) !== String(req.user._id)) await Audit.create({ actorId: req.user._id, action: 'read-inbox', targetId: receiverId });
  return ok(res, { messages: messages.map(messageDTO), total, page, limit });
}
export async function updateMessage(req, res) {
  const update = { $set: {} };
  if (req.body.read === true) update.$set.readAt = new Date();
  if (req.body.read === false) update.$unset = { readAt: 1 };
  if (req.body.favorite !== undefined) update.$set.favorite = req.body.favorite;
  if (req.body.published !== undefined) {
    update.$set.published = req.body.published;
    if (req.body.published) update.$set.shareId = randomBytes(24).toString('hex');
    else update.$unset = { ...update.$unset, shareId: 1 };
  }
  const message = await Message.findOneAndUpdate({ _id: req.params.messageId, receiverId: req.user._id }, update, { returnDocument: 'after' }).select('+shareId');
  if (!message) NotFoundException('Message not found');
  return ok(res, { message: messageDTO(message) });
}
export async function deleteMessage(req, res) {
  const result = await Message.deleteOne({ _id: req.params.messageId, receiverId: req.user._id });
  if (!result.deletedCount) NotFoundException('Message not found');
  return ok(res);
}
export async function reportMessage(req, res) {
  const message = await Message.findOne({ _id: req.params.messageId, receiverId: req.user._id });
  if (!message) NotFoundException('Message not found');
  const report = await Report.create({ messageId: message._id, reporterId: req.user._id, content: message.content, reason: req.body.reason });
  return ok(res, { report }, 201);
}
export async function blockSender(req, res) {
  const message = await Message.findOne({ _id: req.params.messageId, receiverId: req.user._id }).select('+senderKey +senderKeys');
  if (!message) NotFoundException('Message not found');
  const keys = message.senderKeys?.length ? message.senderKeys : [message.senderKey].filter(Boolean);
  if (!keys.length) BadRequestException('Sender information is unavailable for this legacy message');
  const blocks = [];
  for (const senderKey of keys) {
    const block = await Block.findOneAndUpdate({ receiverId: req.user._id, senderKey }, { $setOnInsert: { receiverId: req.user._id, senderKey } }, { upsert: true, returnDocument: 'after' });
    blocks.push({ _id: block._id, createdAt: block.createdAt });
  }
  return ok(res, { blocks }, 201);
}
export async function listReports(req, res) {
  const { page, limit, status } = req.validated.query;
  const filter = status ? { status } : {};
  const [reports, total] = await Promise.all([Report.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit), Report.countDocuments(filter)]);
  return ok(res, { reports, total, page, limit });
}
export async function resolveReport(req, res) {
  const report = await Report.findOneAndUpdate({ _id: req.params.reportId, status: 'open' }, { $set: { status: req.body.status, resolvedBy: req.user._id } }, { returnDocument: 'after' });
  if (!report) NotFoundException('Open report not found');
  await Audit.create({ actorId: req.user._id, action: 'report-' + req.body.status, targetId: report._id });
  return ok(res, { report });
}
export async function adminStatistics(req, res) {
  const [users, messages, openReports, frozenAccounts] = await Promise.all([User.countDocuments(), Message.countDocuments(), Report.countDocuments({ status: 'open' }), User.countDocuments({ freezedAt: { $exists: true } })]);
  return ok(res, { users, messages, openReports, frozenAccounts });
}
export async function auditLog(req, res) {
  const { page, limit } = req.validated.query;
  const [events, total] = await Promise.all([Audit.find().sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit), Audit.countDocuments()]);
  return ok(res, { events, total, page, limit });
}
export async function publicMessages(req, res) {
  const user = await User.exists({ _id: req.params.receiverId, ...activeAccountFilter });
  if (!user) NotFoundException();
  const { page, limit, sort } = req.validated.query;
  const filter = { receiverId: req.params.receiverId, published: true };
  const [messages, total] = await Promise.all([
    Message.find(filter).select('content createdAt').sort({ createdAt: sort === 'oldest' ? 1 : -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    Message.countDocuments(filter),
  ]);
  return ok(res, { messages, total, page, limit });
}
async function sharedMessage(req) {
  const message = await Message.findOne({ shareId: req.params.shareId, published: true });
  if (!message || !await User.exists({ _id: message.receiverId, ...activeAccountFilter })) NotFoundException();
  return message;
}
export async function getShared(req, res) {
  const message = await sharedMessage(req);
  return ok(res, { message: { content: message.content, createdAt: message.createdAt } });
}
export async function shareImage(req, res) {
  const message = await sharedMessage(req);
  const chars = Array.from(message.content);
  const lines = [];
  for (let i = 0; i < chars.length; i += 35) lines.push(chars.slice(i, i + 35).join(''));
  const height = Math.max(400, 180 + lines.length * 42);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="' + height + '" viewBox="0 0 1080 ' + height + '"><rect width="100%" height="100%" fill="#102b46"/><text x="540" y="64" text-anchor="middle" font-family="Arial" font-size="30" fill="#6ee7cf">Sara7a</text>' + lines.map((line, i) => '<text x="540" y="' + (140 + i * 42) + '" text-anchor="middle" style="unicode-bidi:plaintext" font-family="Arial" font-size="28" fill="white">' + escapeXml(line) + '</text>').join('') + '</svg>';
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  res.set('Content-Disposition', 'attachment; filename="sara7a-message.png"').type('image/png').send(png);
}
