import mongoose from 'mongoose';
const schema = new mongoose.Schema({ _id: String, expiresAt: { type: Date, required: true } });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.models.Abuse || mongoose.model('Abuse', schema);
