import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { ProviderEnum, RoleEnum } from '../../Utils/enum/user.enum.js';
export const privateFields = ['password', 'confirmEmailOTP', 'confirmEmailOTPExpiresAt', 'confirmEmailOTPAttempts', 'confirmEmailOTPSentAt', 'forgetPasswordOTP', 'forgetPasswordOTPExpiresAt', 'forgetPasswordOTPAttempts', 'forgetPasswordOTPSentAt', 'tokenVersion', 'googleSub', '__v'];
const schema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true, minlength: 1, maxlength: 50 },
  lastName: { type: String, default: '', trim: true, maxlength: 50 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, select: false, required() { return this.provider === ProviderEnum.system; } },
  provider: { type: Number, enum: Object.values(ProviderEnum), default: ProviderEnum.system },
  googleSub: { type: String, select: false },
  role: { type: Number, enum: Object.values(RoleEnum), default: RoleEnum.user },
  phone: { type: String, select: false },
  age: { type: Number, min: 1, max: 120 },
  DOB: Date,
  gender: { type: String, enum: ['0', '1'], default: '0' },
  confirmEmail: Date,
  confirmEmailOTP: { type: String, select: false },
  confirmEmailOTPExpiresAt: { type: Date, select: false },
  confirmEmailOTPAttempts: { type: Number, default: 0, select: false },
  confirmEmailOTPSentAt: { type: Date, select: false },
  forgetPasswordOTP: { type: String, select: false },
  forgetPasswordOTPExpiresAt: { type: Date, select: false },
  forgetPasswordOTPAttempts: { type: Number, default: 0, select: false },
  forgetPasswordOTPSentAt: { type: Date, select: false },
  profilePicture: String,
  coverImages: [String],
  bio: { type: String, maxlength: 300, default: '' },
  handle: { type: String, lowercase: true, trim: true, match: /^[a-z0-9][a-z0-9_-]{2,29}$/, default: () => 'user-' + randomBytes(10).toString('hex') },
  theme: { type: String, enum: ['light', 'dark', 'blue'], default: 'light' },
  notificationsEnabled: { type: Boolean, default: true },
  profileViews: { type: Number, default: 0 },
  acceptMessages: { type: Boolean, default: true },
  allowAnonymous: { type: Boolean, default: true },
  tokenVersion: { type: Number, default: 0, select: false },
  changeCredentialsTime: Date,
  freezedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  freezedAt: Date,
  restoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  restoredAt: Date,
  deletingAt: Date,
}, { timestamps: true, toJSON: { virtuals: true, transform(_doc, ret) { for (const key of [...privateFields, 'phone']) delete ret[key]; return ret; } } });
schema.virtual('username').get(function () { return `${this.firstName} ${this.lastName}`.trim(); });
schema.index({ handle: 1 }, { unique: true, partialFilterExpression: { handle: { $type: 'string' } } });
export function safeUser(user) {
  const value = user.toObject ? user.toObject() : { ...user };
  for (const key of [...privateFields, 'phone']) delete value[key];
  return value;
}
export default mongoose.models.User || mongoose.model('User', schema);
