import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
const { default: bootstrap } = await import('../src/app.controller.js');
const { encrypt, decrypt } = await import('../src/Utils/security/encryption.security.js');
const { issueTokens, verifyToken, getSignature } = await import('../src/Utils/Token/token.js');
const { authorization } = await import('../src/middlewares/auth.meddleware.js');
const { updatePasswordSchema } = await import('../src/modules/User/user.validation.js');

test('application imports, health works and protected routes reject missing credentials', async () => {
  const app = await bootstrap(express(), express);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.equal((await fetch(base + '/health/live')).status, 200);
    assert.equal((await fetch(base + '/health/ready')).status, 503);
    assert.equal((await fetch(base + '/api/user')).status, 401);
    assert.equal((await fetch(base + '/missing')).status, 404);
    assert.equal((await fetch(base + '/', { headers: { Origin: 'https://evil.example' } })).status, 403);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('encrypted phone round trips and rejects tampering', async () => {
  const encrypted = await encrypt('01012345678');
  assert.equal(await decrypt(encrypted), '01012345678');
  const parts = encrypted.split(':'); parts[2] = '00'.repeat(16);
  await assert.rejects(decrypt(parts.join(':')));
});
test('token types and role signing keys are isolated', () => {
  const user = { _id: 'a'.repeat(24), role: 1, tokenVersion: 2 };
  const tokens = issueTokens(user, 'session');
  assert.equal(verifyToken({ token: tokens.accessToken }).type, 'access');
  assert.throws(() => verifyToken({ token: tokens.refreshToken }));
  assert.throws(() => verifyToken({ token: tokens.accessToken, secertKey: getSignature({ signatureLevel: 0 }).accessSignature }));
});
test('authorization denies wrong role and allows admin', () => {
  let next = false;
  authorization({ accessRole: [0] })({ user: { role: 0 } }, {}, () => { next = true; });
  assert.equal(next, true);
  assert.throws(() => authorization({ accessRole: [0] })({ user: { role: 1 } }, {}, () => {}), { status: 403 });
});
test('password update requires matching confirmation', () => {
  assert.ok(updatePasswordSchema.body.validate({ oldPassword: 'old', newPassword: 'new-password-123' }).error);
  assert.ok(updatePasswordSchema.body.validate({ oldPassword: 'old', newPassword: 'new-password-123', confirmNewPassword: 'different' }).error);
  assert.equal(updatePasswordSchema.body.validate({ oldPassword: 'old', newPassword: 'new-password-123', confirmNewPassword: 'new-password-123' }).error, undefined);
});
