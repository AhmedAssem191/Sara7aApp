import mongoose from 'mongoose';
const schema = new mongoose.Schema({ receiverId: { type: mongoose.Schema.Types.ObjectId, required: true }, senderKey: { type: String, required: true, select: false } }, { timestamps: true });
schema.index({ receiverId: 1, senderKey: 1 }, { unique: true });
export default mongoose.models.Block || mongoose.model('Block', schema);
