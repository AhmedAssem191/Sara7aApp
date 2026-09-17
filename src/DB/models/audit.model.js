import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, required: true },
  action: { type: String, required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { timestamps: true });
schema.index({ createdAt: -1 });
export default mongoose.models.Audit || mongoose.model('Audit', schema);
