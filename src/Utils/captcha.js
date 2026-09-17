import { CAPTCHA_SECRET } from '../../config/config.service.js';
import { BadRequestException, errorResponse } from './response/error.response.js';
export async function verifyCaptcha(req) {
  if (!CAPTCHA_SECRET) return;
  if (!req.body.captchaToken) BadRequestException('CAPTCHA is required');
  let result;
  try {
    if (req.app.locals.verifyCaptcha) result = await req.app.locals.verifyCaptcha(req.body.captchaToken);
    else {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', body: new URLSearchParams({ secret: CAPTCHA_SECRET, response: req.body.captchaToken, remoteip: req.ip }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error();
      result = await response.json();
    }
  } catch { errorResponse({ status: 503, message: 'CAPTCHA service unavailable' }); }
  if (!result?.success) BadRequestException('Invalid CAPTCHA');
}
