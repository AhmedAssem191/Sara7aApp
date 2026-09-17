import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  messageId: { type: mongoose.Schema.Types.ObjectId, required: true },
  reporterId: { type: mongoose.Schema.Types.ObjectId, required: true },
  content: { type: String, required: true, maxlength: 500 },
  reason: { type: String, required: true, maxlength: 500 },
  status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' },
  resolvedBy: mongoose.Schema.Types.ObjectId,
}, { timestamps: true });
schema.index({ messageId: 1, reporterId: 1 }, { unique: true });
schema.index({ status: 1, createdAt: -1 });
export default mongoose.models.Report || mongoose.model('Report', schema);
