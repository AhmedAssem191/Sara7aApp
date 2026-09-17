import RateLimit from '../DB/models/rate-limit.model.js';
// Atomic windows shared by all API processes. Database TTL removes inactive keys.
export class MongoRateLimitStore {
  constructor(prefix) { this.prefix = prefix; this.localKeys = false; }
  init(options) { this.windowMs = options.windowMs; }
  async increment(key) {
    const now = new Date();
    const expired = { $lte: [{ $ifNull: ['$resetAt', new Date(0)] }, now] };
    const update = [{ $set: {
      count: { $cond: [expired, 1, { $add: ['$count', 1] }] },
      resetAt: { $cond: [expired, new Date(+now + this.windowMs), '$resetAt'] },
    } }];
    let result;
    try { result = await RateLimit.collection.findOneAndUpdate({ _id: this.prefix + ':' + key }, update, { upsert: true, returnDocument: 'after' }); }
    catch (error) {
      if (error.code !== 11000) throw error;
      result = await RateLimit.collection.findOneAndUpdate({ _id: this.prefix + ':' + key }, update, { returnDocument: 'after' });
    }
    return { totalHits: result.count, resetTime: result.resetAt };
  }
  async decrement(key) { await RateLimit.updateOne({ _id: this.prefix + ':' + key, count: { $gt: 0 } }, { $inc: { count: -1 } }); }
  async resetKey(key) { await RateLimit.deleteOne({ _id: this.prefix + ':' + key }); }
}
