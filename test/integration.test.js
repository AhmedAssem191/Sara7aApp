import './setup.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
const { default: bootstrap } = await import('../src/app.controller.js');
const { default: User } = await import('../src/DB/models/user.model.js');
const { default: Message } = await import('../src/DB/models/message.model.js');
const { default: Session } = await import('../src/DB/models/session.model.js');
const { default: Block } = await import('../src/DB/models/block.model.js');
const { default: Report } = await import('../src/DB/models/report.model.js');
const { default: Abuse } = await import('../src/DB/models/abuse.model.js');
const { default: Audit } = await import('../src/DB/models/audit.model.js');
const { generateHash } = await import('../src/Utils/security/hash.security.js');
const { getNewLoginCredientails } = await import('../src/Utils/Token/token.js');
let mongo, server, app, base, alice, bob, admin;
const codes = new Map();
const uploadedIds = new Set();
async function request(route, { method = 'GET', body, token, form } = {}) {
  const response = await fetch(base + route, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: form || (body ? JSON.stringify(body) : undefined) });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}
async function account(name, role = 1) {
  const user = await User.create({ firstName: name, lastName: 'Test', email: name.toLowerCase() + '@example.com', password: await generateHash({ plaintext: 'safe-password-123', algo: 'argon2' }), confirmEmail: new Date(), role });
  return { user, ...(await getNewLoginCredientails(user, { headers: { 'user-agent': 'integration-test' } })) };
}
before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: path.resolve('node_modules/.cache/mongodb-memory-server') }, instance: { dbName: 'sara7a_test' } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User, Message, Session, Block, Report, Abuse, Audit].map(model => model.init()));
  app = await bootstrap(express(), express);
  app.locals.sendOtpEmail = async data => codes.set(data.to + ':' + data.purpose, data.otp);
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = 'http://127.0.0.1:' + server.address().port;
  alice = await account('Alice'); bob = await account('Bob'); admin = await account('Admin', 0);
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  const root = path.resolve('src/uploads/User');
  for (const id of uploadedIds) {
    const dir = path.resolve(root, id);
    assert.equal(path.dirname(dir), root);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('signup, email confirmation, login and atomic refresh rotation', async () => {
  const email = 'signup@example.com', password = 'strong-password-123';
  let r = await request('/api/auth/signup', { method: 'POST', body: { firstName: 'Test', lastName: 'Account', email, password, confirmPassword: password, phone: '01012345678', age: 22 } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.data.user.password, undefined);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { email, password } })).status, 401);
  const otp = codes.get(email + ':confirmEmail'); assert.match(otp, /^\d{6}$/);
  assert.equal((await request('/api/auth/confirm-email', { method: 'PATCH', body: { email, otp } })).status, 200);
  assert.equal((await request('/api/auth/confirm-email', { method: 'PATCH', body: { email, otp } })).status, 400);
  r = await request('/api/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(r.status, 200);
  const { accessToken, refreshToken } = r.data.data.credentials;
  const profile = await request('/api/user', { token: accessToken });
  assert.equal(profile.data.data.user.phone, '01012345678');
  assert.equal((await request('/api/auth/refresh-token', { method: 'POST', token: accessToken })).status, 401);
  const attempts = await Promise.all([1, 2].map(() => request('/api/auth/refresh-token', { method: 'POST', token: refreshToken })));
  assert.deepEqual(attempts.map(r => r.status).sort(), [200, 401]);
  assert.equal((await request('/api/auth/logout', { method: 'POST', token: accessToken, body: {} })).status, 200);
  assert.equal((await request('/api/user', { token: accessToken })).status, 401);
});

test('message inbox is isolated, paginated, searchable and ownership protected', async () => {
  let r = await request('/api/message/send-message/' + alice.user._id, { method: 'POST', body: { content: 'hello [private] world' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.data.message.senderKey, undefined);
  const id = r.data.data.message._id;
  await Message.create({ receiverId: bob.user._id, content: 'Bob private message' });
  r = await request('/api/message/get-message?limit=1&search=%5Bprivate%5D', { token: alice.accessToken });
  assert.equal(r.status, 200); assert.equal(r.data.data.total, 1); assert.equal(r.data.data.messages[0]._id, id);
  const bobInbox = await request('/api/message/get-message', { token: bob.accessToken });
  assert.equal(bobInbox.data.data.messages.some(m => m._id === id), false);
  assert.equal((await request('/api/message/' + id, { method: 'PATCH', token: bob.accessToken, body: { favorite: true } })).status, 404);
  assert.equal((await request('/api/message/' + id, { method: 'DELETE', token: bob.accessToken })).status, 404);
  assert.equal((await request('/api/message/get-message-admin/' + alice.user._id, { token: bob.accessToken })).status, 403);
  assert.equal((await request('/api/message/get-message-admin/' + alice.user._id, { token: admin.accessToken })).status, 200);
  r = await request('/api/message/' + id, { method: 'PATCH', token: alice.accessToken, body: { favorite: true, read: true } });
  assert.equal(r.status, 200); assert.equal(r.data.data.message.favorite, true); assert.ok(r.data.data.message.readAt);
  r = await request('/api/message/get-message?favorite=true&read=true', { token: alice.accessToken });
  assert.equal(r.data.data.total, 1);
  assert.equal((await request('/api/message/get-message?limit=1000', { token: alice.accessToken })).status, 400);
});

test('privacy controls, inactive recipients and duplicate suppression', async () => {
  await request('/api/user', { method: 'PATCH', token: bob.accessToken, body: { acceptMessages: false } });
  assert.equal((await request('/api/message/send-message/' + bob.user._id, { method: 'POST', body: { content: 'closed inbox' } })).status, 403);
  await request('/api/user', { method: 'PATCH', token: bob.accessToken, body: { acceptMessages: true, allowAnonymous: false } });
  assert.equal((await request('/api/message/send-message/' + bob.user._id, { method: 'POST', body: { content: 'anonymous blocked' } })).status, 403);
  const send = () => request('/api/message/send-message/' + bob.user._id, { method: 'POST', token: alice.accessToken, body: { content: 'registered sender' } });
  const results = await Promise.all([send(), send()]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 429]);
  const inactive = await User.create({ firstName: 'Inactive', email: 'inactive@example.com', password: 'irrelevant' });
  assert.equal((await request('/api/message/send-message/' + inactive._id, { method: 'POST', body: { content: 'unconfirmed recipient' } })).status, 404);
});

test('public profile exposes only approved fields, handles are unique and QR is generated', async () => {
  let r = await request('/api/user', { method: 'PATCH', token: alice.accessToken, body: { handle: 'alice-test', bio: 'Hello', theme: 'dark' } });
  assert.equal(r.status, 200);
  assert.equal((await request('/api/user', { method: 'PATCH', token: bob.accessToken, body: { handle: 'alice-test' } })).status, 409);
  assert.equal((await request('/api/user', { method: 'PATCH', token: bob.accessToken, body: { role: 0 } })).status, 400);
  r = await request('/u/alice-test');
  assert.equal(r.status, 200);
  for (const key of ['email', 'password', 'phone', 'role', 'age', 'tokenVersion', 'profileViews']) assert.equal(r.data.data.user[key], undefined);
  r = await request('/u/alice-test/qr'); assert.equal(r.status, 200); assert.match(r.data, /<svg/);
  r = await request('/api/user/stats', { token: alice.accessToken }); assert.equal(r.data.data.profileViews, 1);
});

test('message publication is opt-in, share output escapes markup and unpublish revokes access', async () => {
  const message = await Message.create({ receiverId: alice.user._id, content: '<script>alert(1)</script> رسالة عربية' });
  let r = await request('/api/message/public/' + alice.user._id); assert.equal(r.data.data.total, 0);
  r = await request('/api/message/' + message._id, { method: 'PATCH', token: alice.accessToken, body: { published: true } });
  const sharePath = new URL(r.data.data.message.shareUrl).pathname;
  r = await request(sharePath); assert.equal(r.status, 200); assert.equal(r.data.data.message.content, message.content);
  const image = await fetch(base + sharePath + '/image');
  assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await image.arrayBuffer()).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  r = await request('/api/message/public/' + alice.user._id); assert.equal(r.data.data.total, 1);
  await request('/api/message/' + message._id, { method: 'PATCH', token: alice.accessToken, body: { published: false } });
  assert.equal((await request(sharePath)).status, 404);
});

test('reports are owner-only and moderation is admin-only', async () => {
  const message = await Message.create({ receiverId: alice.user._id, content: 'Report this message' });
  const route = '/api/message/' + message._id + '/report';
  assert.equal((await request(route, { method: 'POST', token: bob.accessToken, body: { reason: 'abusive' } })).status, 404);
  let r = await request(route, { method: 'POST', token: alice.accessToken, body: { reason: 'abusive' } });
  assert.equal(r.status, 201); const id = r.data.data.report._id;
  assert.equal((await request(route, { method: 'POST', token: alice.accessToken, body: { reason: 'abusive' } })).status, 409);
  assert.equal((await request('/api/message/reports', { token: bob.accessToken })).status, 403);
  r = await request('/api/message/reports?status=open', { token: admin.accessToken }); assert.equal(r.data.data.total, 1);
  r = await request('/api/message/reports/' + id, { method: 'PATCH', token: admin.accessToken, body: { status: 'resolved' } }); assert.equal(r.status, 200);
  r = await request('/api/message/admin/audit', { token: admin.accessToken }); assert.ok(r.data.data.events.some(e => e.action === 'report-resolved'));
  assert.equal((await request('/api/message/admin/stats', { token: admin.accessToken })).status, 200);
});

test('blocking works for anonymous senders without exposing their identity', async () => {
  const receiver = await account('Blockreceiver');
  const send = content => request('/api/message/send-message/' + receiver.user._id, { method: 'POST', body: { content } });
  let r = await send('message before block'); const id = r.data.data.message._id;
  r = await request('/api/message/' + id + '/block', { method: 'POST', token: receiver.accessToken });
  assert.equal(r.status, 201); assert.equal(r.data.data.blocks[0].senderKey, undefined);
  assert.equal((await send('message after block')).status, 403);
  r = await request('/api/user/blocks', { token: receiver.accessToken }); assert.equal(r.data.data.total, 1); assert.equal(r.data.data.blocks[0].senderKey, undefined);
  await request('/api/user/blocks/' + r.data.data.blocks[0]._id, { method: 'DELETE', token: receiver.accessToken });
  assert.equal((await send('message after unblock')).status, 201);
});

test('valid images upload, replacement removes old file, invalid/oversized files leave no files', async () => {
  const id = String(alice.user._id); uploadedIds.add(id);
  const dir = path.resolve('src/uploads/User', id);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7xkAAAAASUVORK5CYII=', 'base64');
  const upload = async (bytes, route = '/api/user/update-profile-pic', count = 1) => {
    const form = new FormData();
    for (let i = 0; i < count; i++) form.append('attachments', new Blob([bytes], { type: 'image/png' }), 'test.png');
    return request(route, { method: 'PATCH', token: alice.accessToken, form });
  };
  let r = await upload(png); assert.equal(r.status, 200, JSON.stringify(r.data));
  const old = r.data.data.profilePicture;
  assert.equal((await request(old)).status, 200);
  r = await upload(png); assert.equal(r.status, 200); assert.equal((await request(old)).status, 404);
  const before = (await fs.readdir(dir)).sort();
  r = await upload(Buffer.from('this is not an image')); assert.equal(r.status, 400);
  r = await upload(Buffer.alloc(5 * 1024 * 1024 + 1)); assert.equal(r.status, 413);
  assert.deepEqual((await fs.readdir(dir)).sort(), before);
  r = await upload(png, '/api/user/update-cover-pic', 2); assert.equal(r.status, 200); assert.equal(r.data.data.coverImages.length, 2);
});

test('password update revokes old sessions and old credentials', async () => {
  const target = await account('Password');
  const newPassword = 'changed-password-123';
  let r = await request('/api/user/update-password', { method: 'PATCH', token: target.accessToken, body: { oldPassword: 'wrong-password', newPassword, confirmNewPassword: newPassword } });
  assert.equal(r.status, 400);
  r = await request('/api/user/update-password', { method: 'PATCH', token: target.accessToken, body: { oldPassword: 'safe-password-123', newPassword, confirmNewPassword: newPassword } });
  assert.equal(r.status, 200);
  assert.equal((await request('/api/user', { token: target.accessToken })).status, 401);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: target.user.email, password: 'safe-password-123' } })).status, 401);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: target.user.email, password: newPassword } })).status, 200);
});

test('freeze and restore require correct roles and never reactivate old sessions', async () => {
  const target = await account('Freeze');
  assert.equal((await request('/api/user/' + target.user._id + '/freeze-account', { method: 'DELETE', token: bob.accessToken })).status, 403);
  assert.equal((await request('/api/user/freeze-account', { method: 'DELETE', token: target.accessToken })).status, 200);
  assert.equal((await request('/api/user', { token: target.accessToken })).status, 401);
  assert.equal((await request('/api/user/' + target.user._id + '/restore-account', { method: 'PATCH', token: bob.accessToken })).status, 403);
  assert.equal((await request('/api/user/' + target.user._id + '/restore-account', { method: 'PATCH', token: admin.accessToken })).status, 200);
  assert.equal((await request('/api/user', { token: target.accessToken })).status, 401);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: target.user.email, password: 'safe-password-123' } })).status, 200);
});

test('export excludes abuse secrets and self deletion verifies identity and cleans dependent records', async () => {
  const target = await account('Delete');
  await Message.create({ receiverId: target.user._id, content: 'export me', senderKey: 'hidden', senderKeys: ['hidden'] });
  let r = await request('/api/user/export', { token: target.accessToken });
  assert.equal(r.status, 200); assert.match(r.data, /export me/); assert.doesNotMatch(r.data, /senderKey|tokenVersion|refreshHash|password/);
  assert.equal((await request('/api/user/me', { method: 'DELETE', token: target.accessToken, body: { confirmation: 'DELETE', password: 'wrong' } })).status, 401);
  r = await request('/api/user/me', { method: 'DELETE', token: target.accessToken, body: { confirmation: 'DELETE', password: 'safe-password-123' } }); assert.equal(r.status, 200);
  assert.equal(await User.countDocuments({ _id: target.user._id }), 0);
  assert.equal(await Message.countDocuments({ receiverId: target.user._id }), 0);
  assert.equal(await Session.countDocuments({ userId: target.user._id }), 0);
  assert.equal((await request('/api/user', { token: target.accessToken })).status, 401);
});

test('live notifications deliver only to owner and stop when disabled', async () => {
  const target = await account('Notify');
  const controller = new AbortController();
  try {
    const response = await fetch(base + '/api/user/notifications', { headers: { Authorization: 'Bearer ' + target.accessToken }, signal: controller.signal });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /event: ready/);
    const sent = await request('/api/message/send-message/' + target.user._id, { method: 'POST', body: { content: 'live notification' } });
    assert.equal(sent.status, 201);
    const result = await Promise.race([reader.read(), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('No notification')), 3000); timer.unref(); })]);
    assert.match(new TextDecoder().decode(result.value), /event: message/);
    assert.equal((await request('/api/user', { method: 'PATCH', token: target.accessToken, body: { notificationsEnabled: false } })).status, 200);
    assert.equal((await reader.read()).done, true);
    assert.equal((await request('/api/user/notifications', { token: target.accessToken })).status, 409);
  } finally { controller.abort(); }
});

test('OTP reset rejects invalid/reused codes and revokes sessions after success', async () => {
  const target = await account('Reset');
  const email = target.user.email, password = 'reset-password-123';
  assert.equal((await request('/api/auth/forget-password', { method: 'PATCH', body: { email } })).status, 200);
  const otp = codes.get(email + ':forgetPassword');
  assert.equal((await request('/api/auth/reset-password', { method: 'PATCH', body: { email, otp: 'xxxxxx', password, confirmPassword: password } })).status, 400);
  assert.equal((await request('/api/auth/reset-password', { method: 'PATCH', body: { email, otp, password, confirmPassword: password } })).status, 200);
  assert.equal((await request('/api/user', { token: target.accessToken })).status, 401);
  assert.equal((await request('/api/auth/reset-password', { method: 'PATCH', body: { email, otp, password, confirmPassword: password } })).status, 400);
});

test('Google login validates provider and supports Google-only profiles', async () => {
  app.locals.verifyGoogleToken = async token => {
    if (token !== 'valid-google') throw new Error('invalid');
    return { sub: 'google-subject', email: 'google@example.com', email_verified: true, given_name: 'Google' };
  };
  assert.equal((await request('/api/auth/social-login', { method: 'POST', body: { idToken: 'bad' } })).status, 401);
  const r = await request('/api/auth/social-login', { method: 'POST', body: { idToken: 'valid-google' } });
  assert.equal(r.status, 200);
  assert.equal((await request('/api/user', { token: r.data.data.credentials.accessToken })).status, 200);
});

test('legacy profiles receive a persistent share handle without losing phone', async () => {
  const { encrypt } = await import('../src/Utils/security/encryption.security.js');
  const target = await account('Legacy');
  await User.collection.updateOne({ _id: target.user._id }, { $unset: { handle: '' }, $set: { phone: await encrypt('01012345678') } });
  const first = await request('/api/user', { token: target.accessToken });
  const second = await request('/api/user', { token: target.accessToken });
  assert.equal(first.status, 200);
  assert.equal(first.data.data.user.handle, second.data.data.user.handle);
  assert.equal(first.data.data.user.phone, '01012345678');
  assert.equal((await request('/u/' + first.data.data.user.handle)).status, 200);
  assert.equal((await User.collection.findOne({ _id: target.user._id })).handle, first.data.data.user.handle);
});

test('Mongo rate limit store counts concurrent requests across instances and resets expired windows', async () => {
  const { MongoRateLimitStore } = await import('../src/Utils/rate-limit.store.js');
  const { default: RateLimit } = await import('../src/DB/models/rate-limit.model.js');
  await RateLimit.init();
  const first = new MongoRateLimitStore('integration'), second = new MongoRateLimitStore('integration');
  first.init({ windowMs: 60000 }); second.init({ windowMs: 60000 });
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? first : second).increment('same-ip')));
  assert.deepEqual(results.map(r => r.totalHits).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
  await RateLimit.updateOne({ _id: 'integration:same-ip' }, { $set: { resetAt: new Date(0) } });
  assert.equal((await first.increment('same-ip')).totalHits, 1);
  await first.resetKey('same-ip');
  assert.equal(await RateLimit.countDocuments({ _id: 'integration:same-ip' }), 0);
});

test('session list and revocation are scoped to the current owner', async () => {
  const target = await account('Sessions');
  let r = await request('/api/auth/sessions', { token: target.accessToken });
  assert.equal(r.status, 200); const id = r.data.data.sessions[0].id;
  assert.equal(r.data.data.sessions[0].current, true);
  assert.equal(r.data.data.sessions[0].refreshHash, undefined);
  assert.equal((await request('/api/auth/sessions/' + id, { method: 'DELETE', token: bob.accessToken })).status, 404);
  assert.equal((await request('/api/auth/sessions/' + id, { method: 'DELETE', token: target.accessToken })).status, 200);
  assert.equal((await request('/api/user', { token: target.accessToken })).status, 401);
});

test('expired reset OTP cannot change a password', async () => {
  const target = await account('Expired');
  const otp = '123456';
  await User.updateOne({ _id: target.user._id }, { $set: {
    forgetPasswordOTP: await generateHash({ plaintext: otp, algo: 'argon2' }),
    forgetPasswordOTPExpiresAt: new Date(Date.now() - 1000), forgetPasswordOTPAttempts: 0,
  } });
  const r = await request('/api/auth/reset-password', { method: 'PATCH', body: { email: target.user.email, otp, password: 'new-password-123', confirmPassword: 'new-password-123' } });
  assert.equal(r.status, 400);
  assert.equal((await request('/api/user', { token: target.accessToken })).status, 200);
});

test('admin deletion cleans uploads, blocks and reports and missing users return 404', async () => {
  const target = await account('Harddelete');
  const id = String(target.user._id); uploadedIds.add(id);
  const dir = path.resolve('src/uploads/User', id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'orphan.png'), 'old orphaned upload');
  const message = await Message.create({ receiverId: target.user._id, content: 'remove with account' });
  await Report.create({ reporterId: target.user._id, messageId: message._id, content: message.content, reason: 'test' });
  await Block.create({ receiverId: target.user._id, senderKey: 'test-key' });
  assert.equal((await request('/api/user/' + id + '/hard-delete', { method: 'DELETE', token: bob.accessToken })).status, 403);
  assert.equal((await request('/api/user/' + id + '/hard-delete', { method: 'DELETE', token: admin.accessToken })).status, 200);
  await assert.rejects(fs.access(dir), { code: 'ENOENT' });
  assert.equal(await Block.countDocuments({ receiverId: target.user._id }), 0);
  assert.equal(await Report.countDocuments({ reporterId: target.user._id }), 0);
  assert.equal((await request('/api/user/' + id + '/hard-delete', { method: 'DELETE', token: admin.accessToken })).status, 404);
});

test('Google sign-in cannot take over an existing password account', async () => {
  app.locals.verifyGoogleToken = async () => ({ email: bob.user.email, email_verified: true, sub: 'different-subject' });
  const r = await request('/api/auth/social-login', { method: 'POST', body: { idToken: 'local-account-google-token' } });
  assert.equal(r.status, 409);
});

test('OTP attempts are capped even when the correct code is supplied after failures', async () => {
  const { resetPassword } = await import('../src/modules/Auth/auth.service.js');
  const target = await account('Attempts');
  const otp = '654321';
  await User.updateOne({ _id: target.user._id }, { $set: {
    forgetPasswordOTP: await generateHash({ plaintext: otp, algo: 'argon2' }),
    forgetPasswordOTPExpiresAt: new Date(Date.now() + 60000), forgetPasswordOTPAttempts: 0,
  } });
  const body = { email: target.user.email, otp: '123456', password: 'changed-password-123' };
  for (let i = 0; i < 5; i++) await assert.rejects(resetPassword({ body }, {}), { status: 400 });
  await assert.rejects(resetPassword({ body: { ...body, otp } }, {}), { status: 400 });
  assert.equal((await request('/api/user', { token: target.accessToken })).status, 200);
});

test('email delivery failure is recoverable through resend', async () => {
  const original = app.locals.sendOtpEmail;
  const email = 'delivery-failure@example.com', password = 'safe-password-123';
  try {
    app.locals.sendOtpEmail = async () => { throw new Error('SMTP unavailable'); };
    const r = await request('/api/auth/signup', { method: 'POST', body: { firstName: 'Delivery', lastName: 'Failure', email, age: 22, phone: '01012345678', password, confirmPassword: password } });
    assert.equal(r.status, 503);
    const user = await User.findOne({ email }).select('+confirmEmailOTP');
    assert.equal(user.confirmEmailOTP, undefined);
  } finally { app.locals.sendOtpEmail = original; }
  assert.equal((await request('/api/auth/resend-confirmation', { method: 'POST', body: { email } })).status, 200);
  assert.match(codes.get(email + ':confirmEmail'), /^\d{6}$/);
});

test('Mongo-backed HTTP rate limiter returns 429 after its configured limit', async () => {
  const { rateLimit } = await import('express-rate-limit');
  const { MongoRateLimitStore } = await import('../src/Utils/rate-limit.store.js');
  const limitedApp = express();
  limitedApp.use(rateLimit({ windowMs: 60000, limit: 2, store: new MongoRateLimitStore('http-test'), standardHeaders: 'draft-8', legacyHeaders: false }));
  limitedApp.get('/', (req, res) => res.json({ ok: true }));
  const limitedServer = limitedApp.listen(0, '127.0.0.1'); await once(limitedServer, 'listening');
  const url = 'http://127.0.0.1:' + limitedServer.address().port;
  try {
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(url)).status, 200);
    const denied = await fetch(url); assert.equal(denied.status, 429); assert.ok(denied.headers.get('retry-after'));
  } finally { limitedServer.closeAllConnections(); await new Promise(resolve => limitedServer.close(resolve)); }
});

test('production entry point opens its port and uses the shared database limiter', async () => {
  const { spawn } = await import('node:child_process');
  const net = await import('node:net');
  const probe = net.createServer().listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['index.js'], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), DB_URI: mongo.getUri(), USER_EMAIL: 'test@example.com', USER_PASSWORD: 'test-only-password', TRUST_PROXY: '', CAPTCHA_SECRET: '' },
  });
  let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  const ended = once(child, 'exit');
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch('http://127.0.0.1:' + port + '/health/ready')).status === 200; } catch {}
      if (ready || child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(ready, true, output);
    const r = await fetch('http://127.0.0.1:' + port + '/api/user');
    assert.equal(r.status, 401);
    const { default: RateLimit } = await import('../src/DB/models/rate-limit.model.js');
    assert.ok(await RateLimit.exists({ _id: /^global:/ }));
  } finally { child.kill(); await ended; }
});
