import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.CAPTCHA_SECRET = 'test-captcha-secret';
const { verifyCaptcha } = await import('../src/Utils/captcha.js');
test('configured CAPTCHA rejects missing/invalid tokens and provider failures', async () => {
  await assert.rejects(verifyCaptcha({ body: {}, app: { locals: {} } }), { status: 400 });
  await assert.rejects(verifyCaptcha({ body: { captchaToken: 'bad' }, app: { locals: { verifyCaptcha: async () => ({ success: false }) } } }), { status: 400 });
  await assert.rejects(verifyCaptcha({ body: { captchaToken: 'provider-down' }, app: { locals: { verifyCaptcha: async () => { throw new Error(); } } } }), { status: 503 });
  await verifyCaptcha({ body: { captchaToken: 'valid' }, app: { locals: { verifyCaptcha: async () => ({ success: true }) } } });
});
