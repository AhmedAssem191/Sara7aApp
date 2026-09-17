import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  content: { type: String, required: true, trim: true, minlength: 2, maxlength: 500 },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderKey: { type: String, select: false },
  senderKeys: { type: [String], select: false, default: undefined },
  favorite: { type: Boolean, default: false },
  published: { type: Boolean, default: false },
  shareId: { type: String, select: false },
  readAt: Date,
}, { timestamps: true });
schema.index({ receiverId: 1, createdAt: -1, _id: -1 });
schema.index({ shareId: 1 }, { unique: true, partialFilterExpression: { shareId: { $type: 'string' } } });
export default mongoose.models.Message || mongoose.model('Message', schema);
