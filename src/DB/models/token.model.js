import mongoose from 'mongoose';
// Legacy blacklist retained for migration/cleanup; new logins use sessions.
const schema = new mongoose.Schema({ jti: { type: String, required: true, unique: true }, userId: { type: mongoose.Schema.Types.ObjectId, required: true }, expiresIn: { type: Date, required: true } }, { timestamps: true });
schema.index({ expiresIn: 1 }, { expireAfterSeconds: 0 });
export default mongoose.models.Token || mongoose.model('Token', schema);
