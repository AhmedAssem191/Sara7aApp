import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  refreshHash: { type: String, required: true, select: false },
  userAgent: { type: String, maxlength: 300 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.models.Session || mongoose.model('Session', schema);
