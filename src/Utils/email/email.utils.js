import nodemailer from 'nodemailer';
import { USER_EMAIL, USER_PASSWORD } from '../../../config/config.service.js';
const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: USER_EMAIL, pass: USER_PASSWORD }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
export async function sendEmail(options) {
  return transporter.sendMail({ from: { name: 'Sara7a', address: USER_EMAIL }, ...options });
}
export const emailSubject = { confirmEmail: 'Confirm your email', resetPassword: 'Reset your password' };
