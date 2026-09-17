// Awaited delivery lets callers handle failures instead of reporting false success.
import { sendEmail, emailSubject } from '../email/email.utils.js';
import { template } from '../email/generateHTML.js';
export async function sendOtpEmail({ to, firstName, otp, purpose }) {
  const subject = purpose === 'confirmEmail' ? emailSubject.confirmEmail : emailSubject.resetPassword;
  return sendEmail({ to, subject, text: `Your Sara7a code is ${otp}. It expires in 10 minutes.`, html: template(otp, firstName, subject) });
}
