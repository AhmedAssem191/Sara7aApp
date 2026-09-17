import mongoose from 'mongoose';
const schema = new mongoose.Schema({ _id: String, count: Number, resetAt: Date });
schema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.models.RateLimit || mongoose.model('RateLimit', schema);
